import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Control, Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable, MultiLock } from "@lib/util/data";
import { StackModel } from "@core/action/stackModel";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * Saving while a `Control.all` / `Control.any` group is in flight.
 *
 * A group leaves a `wait` link on the stack and runs its branches as StackModels of their own, so a
 * save taken while one is running has to carry the link, every branch's own stack, and nothing else.
 * It used to carry one thing more: the action that created the group, written above the group by the
 * `waitingAction` rule in `serialize`. Reloading such a save threw before it finished rebuilding the
 * stack, because a stack refuses to hold anything above a group whose branches have not drained -
 * and had it been allowed to, the group would have been created a second time and every branch
 * restarted from the top.
 *
 * Every test here reads the same way: run to a point mid-group, save, load into a fresh game, and
 * compare the two halves against the run that was never interrupted. Anything a load drops or
 * repeats shows up as a difference in that one list.
 *
 * Branches are held open by `Control.sleep(awaitable)` rather than by dialogue: what is under test
 * is what a save carries, not how a click reaches a line, and an awaitable the test resolves itself
 * puts the save at an exactly known point. Scene bodies are `Script` actions for the same reason.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** What the story ran, in order. */
    log: string[];
    /** The group currently being driven, as `Player.next()` holds it. */
    group: Awaitable<void> | null;
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(log: string[], entry: Scene): Harness {
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

    // Stand in for the React tree: a scene entering the stage parks on a mounted component, and so
    // does every layer it brings with it. One stub covers both, mounted for every element the story
    // holds - which is exactly the map a save is restored against.
    const [, elements] = constructMaps(liveGame);
    elements.forEach(element => {
        if (state.isStateMounted(element as never)) {
            return;
        }
        state.mountState(element as never, {
            initDisplayable: (onMounted: VoidFunction) => onMounted(),
            setBackgroundMusic: async (music: Sound | null) => {
                (element as unknown as Scene).state.backgroundMusic = music;
            },
        } as never);
    });

    return { game, state, liveGame, log, group: null };
}

function constructMaps(liveGame: LiveGame): [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>] {
    return (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
}

/** The id of the one action of this type in the story - used to forge a save in the old shape. */
function actionIdOfType(h: Harness, type: string): string {
    for (const [id, action] of constructMaps(h.liveGame)[0]) {
        if (action.type === type) {
            return id;
        }
    }
    throw new Error(`no action of type ${type} in the story`);
}

/**
 * One turn of `Player.next()`: roll the main stack, and when it hands back a group that is still
 * awaiting, hand the branches to `executeStackModelGroup` and let that drive them.
 *
 * The group is held on the harness rather than awaited inline so that a test can stop mid-group and
 * carry on later without a second driver: while a group is in flight this only ticks, because the
 * branches are already being rolled by the `execute()` loops that group started.
 */
async function step(h: Harness): Promise<void> {
    if (h.group) {
        if (!h.group.isSettled()) {
            await tick();
            return;
        }
        h.group = null;
    }

    const result = h.liveGame.next();
    if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
        if (!result.isSettled()) {
            await tick();
        }
    } else if (result instanceof MultiLock) {
        // Nothing here locks the game, but `next()` can hand one back and the player checks for it
        // before it reads a result, so this does too.
        await tick();
    } else if (StackModel.isCalledActionResult(result) && result.wait
        && StackModel.isStackModelsAwaiting(result.wait.type, result.wait.stackModels)) {
        h.group = StackModel.executeStackModelGroup(result.wait.type, result.wait.stackModels);
    }
    await tick();
}

/** Roll until the story runs out of actions. */
async function drive(h: Harness, budget: number = 800): Promise<void> {
    for (let i = 0; i < budget; i++) {
        if (!h.group && h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        await step(h);
    }
    throw new Error(`drive: out of budget (log: ${h.log.join(",")})`);
}

/** Roll until `marker` has been logged, leaving whatever is running exactly where it is. */
async function driveUntil(h: Harness, marker: string, budget: number = 800): Promise<void> {
    for (let i = 0; i < budget; i++) {
        if (h.log.includes(marker)) {
            return;
        }
        if (!h.group && h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveUntil: story ended before "${marker}" (log: ${h.log.join(",")})`);
        }
        await step(h);
    }
    throw new Error(`driveUntil: "${marker}" never ran (log: ${h.log.join(",")})`);
}

/** Load a save into a fresh run of the same story, and let the render the player would do land. */
async function loadInto(h: Harness, saved: SavedGame): Promise<void> {
    h.liveGame.newGame();
    h.liveGame.deserialize(JSON.parse(JSON.stringify(saved)) as SavedGame);
    h.state.events.emit(GameState.EventTypes["event:state.onRender"]);
    await tick();
    await tick();
}

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

/** The `stackModel` a save carries for the main stack. */
const savedItems = (saved: SavedGame) => saved.game.stackModel.items;

/**
 * Run `build()` twice: once straight through, and once interrupted by a save taken as soon as
 * `marker` has run and resumed in a fresh game. Both runs open the same gate at the same point.
 *
 * Returns the two logs to compare, plus the save and the two harnesses for tests that want to look
 * at more than the log.
 */
async function saveAndResume<T extends { log: string[]; gate: Awaitable<void>; main: Scene }>(
    build: () => T,
    marker: string,
) {
    const first = build();
    const h1 = harness(first.log, first.main);
    h1.liveGame.newGame();
    await driveUntil(h1, marker);

    const saved = h1.liveGame.serialize();
    const beforeSave = [...first.log];

    // The run the save came from carries on to the end - that is the ordering everything is
    // measured against.
    first.gate.resolve();
    await drive(h1);
    const uninterrupted = [...first.log];

    const second = build();
    const h2 = harness(second.log, second.main);
    await loadInto(h2, saved);
    second.gate.resolve();
    await drive(h2);

    return {
        saved,
        beforeSave,
        uninterrupted,
        resumed: beforeSave.concat(second.log),
        first,
        second,
        h1,
        h2,
    };
}

/** `Control.all` over a branch that parks on a gate and a branch that drains before the save. */
function allStory() {
    const log: string[] = [];
    const gate = new Awaitable<void>();
    const main = new Scene("main");
    main.action([
        mark(log, "before"),
        Control.all([
            Control.do([mark(log, "P1"), Control.sleep(gate), mark(log, "P2"), mark(log, "P3")]),
            Control.do([mark(log, "Q1"), mark(log, "Q2")]),
        ]),
        mark(log, "after"),
    ] as never);
    return { log, gate, main };
}

/** `Control.any` over two branches, both parked on a gate when the save is taken. */
function anyStory() {
    const log: string[] = [];
    const gate = new Awaitable<void>();
    const slow = new Awaitable<void>();
    const main = new Scene("main");
    main.action([
        mark(log, "before"),
        Control.any([
            Control.do([mark(log, "P1"), Control.sleep(slow), mark(log, "P2")]),
            Control.do([mark(log, "Q1"), Control.sleep(gate), mark(log, "Q2")]),
        ]),
        mark(log, "after"),
    ] as never);
    return { log, gate, slow, main };
}

/** A group inside a branch of a group: the inner one is what is in flight when the save is taken. */
function nestedStory() {
    const log: string[] = [];
    const gate = new Awaitable<void>();
    const main = new Scene("main");
    main.action([
        mark(log, "before"),
        Control.all([
            Control.do([
                mark(log, "P1"),
                Control.all([
                    Control.do([mark(log, "X1"), Control.sleep(gate), mark(log, "X2")]),
                    Control.do([mark(log, "Y1"), mark(log, "Y2")]),
                ]),
                mark(log, "P2"),
            ]),
            Control.do([mark(log, "Q1"), mark(log, "Q2")]),
        ]),
        mark(log, "after"),
    ] as never);
    return { log, gate, main };
}

/** A returnable jump taken from inside one branch of a group, with the called scene still running. */
function callInBranchStory() {
    const log: string[] = [];
    const gate = new Awaitable<void>();
    const sub = new Scene("sub");
    const main = new Scene("main");
    sub.action([mark(log, "B1"), Control.sleep(gate), mark(log, "B2")] as never);
    main.action([
        mark(log, "A1"),
        Control.all([
            Control.do([mark(log, "P1"), main.jumpTo(sub, { returnable: true }), mark(log, "P2")]),
            Control.do([mark(log, "Q1"), mark(log, "Q2")]),
        ]),
        mark(log, "A2"),
    ] as never);
    return { log, gate, main, sub };
}

describe("what a save carries while a group is running", () => {
    it("carries the group, and not the action that created it", async () => {
        const { log, main } = allStory();
        const h = harness(log, main);
        h.liveGame.newGame();
        await driveUntil(h, "Q2");

        const items = savedItems(h.liveGame.serialize());
        // One item, and it is the group itself. The `control:all` that created it used to be
        // written above this, which is the item no stack will accept back.
        expect(items).toHaveLength(1);
        expect(items[0].type).toBe("link");
        expect(items[0].type === "link" && items[0].stackWaitType).toBe("all");
        expect(items.some(item => item.actionType === "control:all")).toBe(false);
    });

    it("carries a branch that has already drained as drained", async () => {
        const { log, main } = allStory();
        const h = harness(log, main);
        h.liveGame.newGame();
        await driveUntil(h, "Q2");

        const link = savedItems(h.liveGame.serialize())[0];
        expect(link.type).toBe("link");
        if (link.type !== "link") return;

        // The parked branch keeps the action it is parked on, so re-running it makes a new
        // awaitable. The finished one keeps nothing: `isStackModelsAwaiting` reads a branch by
        // whether its stack is empty, so a branch that came back holding one more action would
        // tell the loaded game the group had not finished when it had.
        expect(link.stacks[0].items.map(item => item.actionType)).toEqual(["control:sleep"]);
        expect(link.stacks[1].items).toEqual([]);
    });
});

describe("a save taken mid-group loads and finishes the same way", () => {
    it("Control.all", async () => {
        const { beforeSave, uninterrupted, resumed } = await saveAndResume(allStory, "Q2");

        expect(uninterrupted).toEqual(["before", "P1", "Q1", "Q2", "P2", "P3", "after"]);
        // The save really was taken mid-group - before the parked branch had finished.
        expect(beforeSave).not.toEqual(uninterrupted);
        expect(resumed).toEqual(uninterrupted);
    });

    it("Control.any", async () => {
        const { beforeSave, uninterrupted, resumed } = await saveAndResume(anyStory, "Q1");

        // The group ends when the first branch drains; the other is left where it was parked.
        expect(uninterrupted).toEqual(["before", "P1", "Q1", "Q2", "after"]);
        expect(beforeSave).not.toEqual(uninterrupted);
        expect(resumed).toEqual(uninterrupted);
    });

    it("a group nested inside a branch of a group", async () => {
        const { beforeSave, uninterrupted, resumed } = await saveAndResume(nestedStory, "Y2");

        expect(uninterrupted).toContain("X2");
        expect(uninterrupted[uninterrupted.length - 1]).toBe("after");
        expect(beforeSave).not.toEqual(uninterrupted);
        expect(resumed).toEqual(uninterrupted);
    });
});

describe("a save taken mid-group with a scene call open inside a branch", () => {
    it("records the caller as suspended", async () => {
        const { log, main, sub } = callInBranchStory();
        const h = harness(log, main);
        h.liveGame.newGame();
        await driveUntil(h, "B1");

        expect(h.state.isSceneSuspended(main)).toBe(true);
        const scenes = h.liveGame.serialize().game.stage.scenes;
        expect(scenes.find(scene => scene.sceneId === main.getId())?.suspended).toBe(true);
        expect(scenes.find(scene => scene.sceneId === sub.getId())?.suspended).toBeUndefined();
    });

    it("comes back with the caller still parked, and still returns to it", async () => {
        const first = callInBranchStory();
        const h1 = harness(first.log, first.main);
        h1.liveGame.newGame();
        await driveUntil(h1, "B1");
        const saved = h1.liveGame.serialize();
        const beforeSave = [...first.log];

        first.gate.resolve();
        await drive(h1);
        const uninterrupted = [...first.log];

        const second = callInBranchStory();
        const h2 = harness(second.log, second.main);
        await loadInto(h2, saved);

        // The call is still open: the caller is on the stage and out of the way, and the called
        // scene is the one the story is running in.
        expect(h2.state.isSceneSuspended(second.main)).toBe(true);
        expect(h2.state.getLastScene()).toBe(second.sub);

        second.gate.resolve();
        await drive(h2);

        // The line after the jump ran, so the return address survived inside the branch.
        expect(uninterrupted).toContain("P2");
        expect(uninterrupted[uninterrupted.length - 1]).toBe("A2");
        expect(beforeSave.concat(second.log)).toEqual(uninterrupted);
        expect(h2.state.isSceneActive(second.sub)).toBe(false);
        expect(h2.state.isSceneSuspended(second.main)).toBe(false);
    });
});

describe("saves written before the group rule", () => {
    it("loads one that carries the creating action above the group, and finishes the same way", async () => {
        const first = allStory();
        const h1 = harness(first.log, first.main);
        h1.liveGame.newGame();
        await driveUntil(h1, "Q2");

        const saved = h1.liveGame.serialize();
        const beforeSave = [...first.log];
        // Exactly what the old `serialize` wrote: the `control:all` that made the group, above it.
        savedItems(saved).push({
            type: "action" as never,
            actionType: "control:all",
            action: actionIdOfType(h1, "control:all"),
        } as never);

        first.gate.resolve();
        await drive(h1);
        const uninterrupted = [...first.log];

        const second = allStory();
        const h2 = harness(second.log, second.main);
        await loadInto(h2, saved);
        second.gate.resolve();
        await drive(h2);

        expect(beforeSave.concat(second.log)).toEqual(uninterrupted);
    });
});
