import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Control, Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import type { PlayerStateElement } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "./stackModel";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * What happens to a `Control.any` branch that loses.
 *
 * `any` finishes as soon as one branch drains, and the branches that did not get there are simply
 * left where they stood. That is fine for a branch that was only queueing marks, and it is not fine
 * for one that had opened a scene call: the call frame it holds - a `scene:resume`, the promise to
 * come back to the scene the branch suspended - goes with the branch, and the suspended scene is
 * then parked on the stage with nothing left that could ever return to it.
 *
 * The main stack is driven the way `Player.tsx` drives it, which is the part that matters here: the
 * player hands a still-waiting group to `StackModel.executeStackModelGroup`, so the branches run
 * under `execute()` rather than under `rollNext`'s recursion into them.
 *
 * Races are decided by a gate the story itself opens rather than by a timer: which branch wins has
 * to be exact, because the whole question is what state the losing branch was in when it was cut.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** What the scene bodies ran, in order. */
    log: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/** A promise the story opens from inside a scene body, used to decide a race exactly. */
function gate(): { promise: Promise<void>; open: () => void } {
    let open: () => void = () => void 0;
    const promise = new Promise<void>(resolve => {
        open = resolve;
    });
    return { promise, open };
}

/** A wait that never ends, so a branch can be caught in a known place. */
const forever = () => new Promise<void>(() => void 0);

function harness(log: string[], entry: Scene, scenes: Scene[]): Harness {
    const game = new Game({ app: { debug: false } });
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });
    const story = new Story("t").entry(entry);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    // Stand in for the React tree - the same stub `sceneCallControlFlow.test.ts` explains: both
    // halves of a scene entering the stage park on a mounted component.
    const [, elements] = (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
    elements.forEach(element => {
        if (state.isStateMounted(element as never)) {
            return;
        }
        state.mountState(element as never, {
            initDisplayable: (onMounted: VoidFunction) => onMounted(),
            setBackgroundMusic: async (music: Sound | null) => {
                (element as unknown as Scene).state.backgroundMusic = music;
            },
            applyTransform: () => Awaitable.resolve<void>(undefined),
            updateStyleSync: () => void 0,
        } as never);
    });
    void scenes;
    return { game, state, liveGame, log };
}

/**
 * Roll the main stack the way `Player.tsx` does: `LiveGame.next()`, and a result that is a
 * still-waiting concurrent group is handed to `StackModel.executeStackModelGroup` rather than being
 * advanced one step at a time.
 */
async function drive(h: Harness, steps: number = 200): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        // `next()` also reports the game lock, which nothing here takes.
        const result = h.liveGame.next() as CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null;
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
            if (!result.isSettled()) {
                await tick();
                if (!result.isSettled()) {
                    throw new Error("drive: parked on an awaitable that never settled");
                }
            }
        } else if (
            StackModel.isCalledActionResult(result)
            && result.wait
            && StackModel.isStackModelsAwaiting(result.wait.type, result.wait.stackModels)
        ) {
            const group = StackModel.executeStackModelGroup(result.wait.type, result.wait.stackModels);
            for (let j = 0; j < 60 && !group.isSettled(); j++) {
                await tick();
            }
            if (!group.isSettled()) {
                throw new Error(`drive: the group never completed (log: ${h.log.join(",")})`);
            }
        }
        await tick();
    }
    throw new Error(`drive: ran out of steps (log: ${h.log.join(",")})`);
}

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

/**
 * Every scene the stage holds, by name, with the suspension flag the save carries.
 *
 * Read straight off `GameState.state.elements` so a scene left mounted with nothing pointing at it
 * still shows up. Sorted by name, because arrival order is not what any of this is about.
 */
function stage(h: Harness): { scene: string; suspended: boolean }[] {
    const { elements } = (h.state as unknown as { state: { elements: PlayerStateElement[] } }).state;
    return elements
        .map(element => ({ scene: element.scene.config.name, suspended: element.suspended === true }))
        .sort((a, b) => a.scene.localeCompare(b.scene));
}

describe("a losing Control.any branch that is inside a scene call", () => {
    it("hands the stage back rather than leaving the caller parked forever", async () => {
        const log: string[] = [];
        const win = gate();
        const sub = new Scene("sub");
        const main = new Scene("main");
        // The callee opens the other branch's gate once it is running, so the race is lost at a
        // moment when the call is definitely open, and then waits for something that never comes.
        sub.action([
            mark(log, "B1"),
            Script.execute(() => win.open()),
            Control.sleep(forever()),
            mark(log, "B2"),
        ] as never);
        main.action([
            mark(log, "A1"),
            Control.any([
                Control.do([main.jumpTo(sub, { returnable: true }), mark(log, "P2")] as never),
                Control.do([Control.sleep(win.promise), mark(log, "Q1")] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        // The race was won by the other branch, so the rest of the calling branch never runs.
        expect(log).toEqual(["A1", "B1", "Q1", "A2"]);
        // ...but the call it had open is given up rather than dropped: the scene it entered leaves
        // the stage and the scene it had suspended is running again.
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.getLastScene()).toBe(main);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
        expect(h.liveGame.asyncStackModels.size).toBe(0);
    });

    it("empties every branch stack it gave up", async () => {
        const log: string[] = [];
        const win = gate();
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([
            mark(log, "B1"),
            Script.execute(() => win.open()),
            Control.sleep(forever()),
            mark(log, "B2"),
        ] as never);
        main.action([
            mark(log, "A1"),
            Control.any([
                Control.do([main.jumpTo(sub, { returnable: true }), mark(log, "P2")] as never),
                Control.do([Control.sleep(win.promise), mark(log, "Q1")] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();

        // Stop while the group is still on the main stack, so the branch stacks can be held on to.
        let branches: StackModel[] = [];
        for (let i = 0; i < 60 && !branches.length; i++) {
            h.liveGame.next();
            branches = h.liveGame.getStackModelForce().getTopSync()?.wait?.stackModels ?? [];
            await tick();
        }
        expect(branches).toHaveLength(2);

        await drive(h);

        expect(branches.map(branch => branch.isEmpty())).toEqual([true, true]);
    });

    it("unwinds a chain of calls the branch had opened, innermost first", async () => {
        const log: string[] = [];
        const win = gate();
        const unloads: string[] = [];
        const inner = new Scene("inner");
        const sub = new Scene("sub");
        const main = new Scene("main");
        inner.action([
            mark(log, "C1"),
            Script.execute(() => win.open()),
            Control.sleep(forever()),
            mark(log, "C2"),
        ] as never);
        sub.action([
            mark(log, "B1"),
            sub.jumpTo(inner, { returnable: true }),
            mark(log, "B2"),
        ] as never);
        main.action([
            mark(log, "A1"),
            Control.any([
                Control.do([main.jumpTo(sub, { returnable: true }), mark(log, "P2")] as never),
                Control.do([Control.sleep(win.promise), mark(log, "Q1")] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub, inner]);
        [main, sub, inner].forEach(scene => {
            scene.events.on("event:scene.preUnmount", () => {
                unloads.push(scene.config.name);
            });
        });

        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "B1", "C1", "Q1", "A2"]);
        // Two frames were open and both are given up, the inner one first - the order
        // `SceneAction.unwindCallStack` uses when a plain jump gives up a call stack.
        expect(unloads).toEqual(["inner", "sub"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });

    it("leaves the winning branch's own call alone", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            Control.any([
                Control.do([main.jumpTo(sub, { returnable: true }), mark(log, "P2")] as never),
                Control.do([Control.sleep(forever()), mark(log, "Q1")] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        // The calling branch wins this time: its call returns the ordinary way, and giving up the
        // branch that lost touches nothing, because that branch never opened a call of its own.
        expect(log).toEqual(["A1", "B1", "P2", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });
});

describe("a Control.all group is never abandoned", () => {
    it("waits for every branch, calls and all", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1"), Control.sleep(20), mark(log, "B2")] as never);
        main.action([
            mark(log, "A1"),
            Control.all([
                Control.do([main.jumpTo(sub, { returnable: true }), mark(log, "P2")] as never),
                Control.do([mark(log, "Q1")] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "Q1", "B1", "B2", "P2", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });
});
