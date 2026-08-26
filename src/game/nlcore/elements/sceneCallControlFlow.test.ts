import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Control, Game, Menu, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import type { PlayerStateElement } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import type { Chosen } from "@player/type";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * A returnable jump taken from somewhere other than the straight line of a scene.
 *
 * `sceneCallReturn.test.ts` drives every call from the main stack. `Control.all`, `Control.any`,
 * `Control.repeat` and a `Menu` choice do not run their bodies there: each one hands its body to a
 * separate `StackModel` and parks a `wait` item on the stack it was reached from. The call frame is
 * two stack items - the return address underneath, the called scene's root on top - pushed onto
 * whichever stack executed `scene:callTo`, so a call taken inside one of those bodies opens its
 * frame on the nested stack while `Control.jump` and `scene:jumpTo` reach past it for the main one
 * through `getStackModelForce()`. That mismatch is what this file is about.
 *
 * The harness is the one from `sceneCallReturn.test.ts`, duplicated rather than shared so that file
 * stays the reference for the straight-line behaviour. Scene bodies are `Script` actions rather
 * than dialogue: a line of dialogue settles on a click, and what is asserted here is the order
 * actions run in, not how a click reaches them.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** What the scene bodies ran, in order. */
    log: string[];
    /** Scene music starts, recorded so the mounted stand-in has somewhere to write. */
    audio: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

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

    const h: Harness = { game, state, liveGame, log, audio: [] };

    // Stand in for the React tree. Both halves of a scene entering the stage park on a mounted
    // component: `scene:init` waits for the scene's own exposed state, and every layer and image
    // the scene brings with it waits for its own. One stub covers both, mounted for every element
    // the story holds.
    const sceneNames = new Map(scenes.map(scene => [scene, scene.config.name]));
    const [, elements] = (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
    elements.forEach(element => {
        if (state.isStateMounted(element as never)) {
            return;
        }
        state.mountState(element as never, {
            initDisplayable: (onMounted: VoidFunction) => onMounted(),
            setBackgroundMusic: async (music: Sound | null, fade: number) => {
                const scene = element as unknown as Scene;
                h.audio.push(`play:${sceneNames.get(scene) ?? "?"}:${music ? music.config.src : "none"}:${fade}`);
                scene.state.backgroundMusic = music;
            },
        } as never);
    });
    return h;
}

/**
 * Roll the main stack the way the player component does, stopping when it empties, when an
 * awaitable will not settle (nothing here is meant to park), or after `steps` rolls.
 */
async function drive(h: Harness, steps: number = 400): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
            if (!result.isSettled()) {
                throw new Error("drive: parked on an awaitable that never settled");
            }
        }
        await tick();
    }
    throw new Error("drive: ran out of steps");
}

/** Roll until `marker` has been logged, so a test can stop the story mid-call. */
async function driveUntil(h: Harness, marker: string, steps: number = 400): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.log.includes(marker)) {
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveUntil: story ended before "${marker}" (log: ${h.log.join(",")})`);
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
        }
        await tick();
    }
    throw new Error(`driveUntil: "${marker}" never ran (log: ${h.log.join(",")})`);
}

/** Roll until a menu is waiting for the player, the way `LiveGame.fastForward` watches for one. */
async function driveUntilMenu(h: Harness, steps: number = 200): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.state.hasActiveMenu()) {
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveUntilMenu: story ended before a menu (log: ${h.log.join(",")})`);
        }
        h.liveGame.next();
        await tick();
    }
    throw new Error(`driveUntilMenu: no menu appeared (log: ${h.log.join(",")})`);
}

/**
 * Take the choice at `index`, as a click on the rendered option does.
 *
 * A menu waits on the `Clickable` the stage holds for the scene menus attach to, and the choice a
 * click hands back is the authored `Choice` plus the text that was shown. Calling it here is the
 * only stand-in the menu path needs.
 */
function chooseMenuOption(h: Harness, index: number): void {
    const scene = h.state.getLastScene();
    if (!scene) {
        throw new Error("chooseMenuOption: no scene on stage");
    }
    const menus = h.state.findElementByScene(scene)?.menus ?? [];
    if (!menus.length) {
        throw new Error("chooseMenuOption: no menu waiting");
    }
    const choice = menus[0].action.choices[index];
    if (!choice) {
        throw new Error(`chooseMenuOption: no choice at ${index}`);
    }
    menus[0].onClick({ ...choice, evaluated: "" } satisfies Chosen);
}

/**
 * Every scene the stage holds, by name, with the suspension flag the save carries.
 *
 * Read straight off `GameState.state.elements` - the list itself, not a helper's view of it - so a
 * scene left mounted with nothing pointing at it still shows up. Sorted by name because the list is
 * ordered by when each scene arrived, which is not what any of this is about.
 */
function stage(h: Harness): { scene: string; suspended: boolean }[] {
    const { elements } = (h.state as unknown as { state: { elements: PlayerStateElement[] } }).state;
    return elements
        .map(element => ({ scene: element.scene.config.name, suspended: element.suspended === true }))
        .sort((a, b) => a.scene.localeCompare(b.scene));
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

/**
 * A body that calls `sub` in the middle of three marks, as one sequential branch.
 *
 * Wrapped in `Control.do` because that is what a concurrent body is documented to need: each entry
 * of `Control.all`/`any` is its own branch, so steps that must stay in order go in one `do`.
 */
function callingBranch(log: string[], caller: Scene, sub: Scene) {
    return Control.do([
        mark(log, "P1"),
        caller.jumpTo(sub, { returnable: true }),
        mark(log, "P2"),
    ] as never);
}

describe("a call taken inside Control.all", () => {
    function allStory() {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            Control.all([
                callingBranch(log, main, sub),
                Control.do([mark(log, "Q1")] as never),
            ]),
            mark(log, "A2"),
        ] as never);
        return { log, main, sub };
    }

    it("parks the caller and puts the called scene on the stage while the branch waits", async () => {
        const { log, main, sub } = allStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");

        expect(stage(h)).toEqual([
            { scene: "main", suspended: true },
            { scene: "sub", suspended: false },
        ]);
        expect(h.state.getSuspendedScenes()).toEqual([main]);
        // The scene new dialogue attaches to is the called one, even though the call was opened
        // from a branch stack rather than the main one.
        expect(h.state.getLastScene()).toBe(sub);
    });

    it("comes back to the rest of the branch, then to the story after the group", async () => {
        const { log, main, sub } = allStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "P1", "Q1", "B1", "P2", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getLastScene()).toBe(main);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
        expect(h.liveGame.asyncStackModels.size).toBe(0);
    });

    // FAILS - a real defect, and NOT one this feature introduced: a save taken while ANY
    // `Control.all` group is in flight cannot be loaded, with or without a call in it. The group
    // is one stack item carrying its branches, and `serialize` writes the action that was running
    // above it; on load `deserialize` pushes the items back bottom-up and the stack's push
    // validator refuses to put anything on top of a group whose branches are not drained. A call
    // opened inside a concurrent body inherits that window: while it is open, the game cannot be
    // saved and reloaded.
    it("can be saved and loaded while the call is open", async () => {
        const { log, main, sub } = allStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");
        const saved = h.liveGame.serialize();

        const second = allStory();
        const h2 = harness(second.log, second.main, [second.main, second.sub]);
        await loadInto(h2, saved);

        expect(h2.state.isSceneSuspended(second.main)).toBe(true);
        expect(h2.state.getLastScene()).toBe(second.sub);

        await drive(h2);
        expect(second.log[second.log.length - 1]).toBe("A2");
        expect(stage(h2)).toEqual([{ scene: "main", suspended: false }]);
    });

    // FAILS - a real defect, reported rather than worked around.
    //
    // `main.jumpTo(sub, {returnable: true})` is one authored statement that flattens to three
    // actions (the entering group, `scene:callTo`, `scene:resume`). A concurrent body is stored
    // unchained (Control.pushUnchained), so the three land as three sibling branches and the call
    // loses the `scene:resume` that was chained behind it. `scene:callTo` then throws a
    // RuntimeInternalError - the class of error that means "the engine broke its own invariant,
    // file a bug" - for a story an author can reasonably write.
    it("runs the callee when the jump is written as a direct entry of the body", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            Control.all([
                main.jumpTo(sub, { returnable: true }),
                mark(log, "Q1"),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toContain("B1");
    });
});

describe("a call taken inside Control.any", () => {
    it("runs the callee and comes back when the calling branch is the only one", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            Control.any([callingBranch(log, main, sub)]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await driveUntil(h, "B1");

        expect(h.state.getSuspendedScenes()).toEqual([main]);
        expect(h.state.getLastScene()).toBe(sub);

        await drive(h);

        expect(log).toEqual(["A1", "P1", "B1", "P2", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getLastScene()).toBe(main);
    });

    // FAILS - a real defect, reported rather than worked around.
    //
    // `Control.any` resolves when the first branch drains and then stops rolling the others, so a
    // branch that was part way into a call is dropped where it stood. Nothing unloads what it
    // already put on the stage: `sub` is mounted, no action can ever reach it, and the story plays
    // on with a scene on the stage that no longer belongs to anything. Dropped a few rolls later
    // the caller would be left suspended instead, with the only frame that could resume it gone.
    it("leaves nothing on the stage when the losing branch was part way into a call", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            Control.any([
                callingBranch(log, main, sub),
                Control.do([
                    mark(log, "Q1"), mark(log, "Q2"), mark(log, "Q3"),
                    mark(log, "Q4"), mark(log, "Q5"), mark(log, "Q6"),
                ] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        // The group is over and the story has moved on, so the called scene must be gone too.
        expect(log).toContain("A2");
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
    });
});

describe("a call taken inside Control.repeat", () => {
    // FAILS - a real defect, and NOT one this feature introduced: `Control.repeat` runs its body
    // once whatever `times` says, with or without a call in it (`Control.repeat(3, [mark])` logs
    // one mark). A loop refills its own stack from `StackModel.onIterationComplete`, which only
    // runs inside `StackModel.execute`; the main stack is driven by `rollNext`, which reads the
    // drained loop stack as "the group is finished" and pops it. So the second iteration - the one
    // that would prove the called scene was released and can be called again - never happens.
    it("runs the body twice and calls the scene again on the second pass", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B")] as never);
        main.action([
            mark(log, "A1"),
            Control.repeat(2, [
                Control.do([
                    mark(log, "P"),
                    main.jumpTo(sub, { returnable: true }),
                    mark(log, "Q"),
                ] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "P", "B", "Q", "P", "B", "Q", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
    });

    it("returns the called scene to the stage on the first pass, whatever the loop does after", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B")] as never);
        main.action([
            mark(log, "A1"),
            Control.repeat(2, [
                Control.do([
                    mark(log, "P"),
                    main.jumpTo(sub, { returnable: true }),
                    mark(log, "Q"),
                ] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log.slice(0, 4)).toEqual(["A1", "P", "B", "Q"]);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.isSceneSuspended(main)).toBe(false);
    });

    // The property the second iteration would have tested, reached without the loop: a call
    // releases the scene it called, so the same scene can be called again straight afterwards.
    // This is what `scene:preSuspend`'s "already on stage" guard has to stay off.
    it("lets the same scene be called twice in a row", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B")] as never);
        main.action([
            mark(log, "A1"),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A3"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "B", "A2", "B", "A3"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
    });
});

describe("a call taken inside a menu choice", () => {
    function menuStory() {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            Menu.prompt("go?")
                .choose("yes", [
                    mark(log, "P1"),
                    main.jumpTo(sub, { returnable: true }),
                    mark(log, "P2"),
                ])
                .choose("no", [mark(log, "N1")]),
            mark(log, "A2"),
        ] as never);
        return { log, main, sub };
    }

    it("parks the caller while the chosen branch is inside the call", async () => {
        const { log, main, sub } = menuStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntilMenu(h);
        expect(log).toEqual(["A1"]);

        chooseMenuOption(h, 0);
        await driveUntil(h, "B1");

        expect(stage(h)).toEqual([
            { scene: "main", suspended: true },
            { scene: "sub", suspended: false },
        ]);
        expect(h.state.getLastScene()).toBe(sub);
    });

    it("comes back to the rest of the choice, then to the story after the menu", async () => {
        const { log, main, sub } = menuStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntilMenu(h);
        chooseMenuOption(h, 0);
        await drive(h);

        expect(log).toEqual(["A1", "P1", "B1", "P2", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getLastScene()).toBe(main);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });

    it("leaves the other choice alone", async () => {
        const { log, main, sub } = menuStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntilMenu(h);
        chooseMenuOption(h, 1);
        await drive(h);

        expect(log).toEqual(["A1", "N1", "A2"]);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });
});

describe("a call taken inside Control.do", () => {
    it("runs the callee and comes back to the rest of the block", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            Control.do([
                mark(log, "P1"),
                main.jumpTo(sub, { returnable: true }),
                mark(log, "P2"),
            ] as never),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await driveUntil(h, "B1");

        expect(stage(h)).toEqual([
            { scene: "main", suspended: true },
            { scene: "sub", suspended: false },
        ]);
        expect(h.state.getLastScene()).toBe(sub);

        await drive(h);

        expect(log).toEqual(["A1", "P1", "B1", "P2", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getLastScene()).toBe(main);
    });
});

describe("a call inside a parallel body inside a call", () => {
    it("holds both callers on the stage and unwinds them in order", async () => {
        const log: string[] = [];
        const inner = new Scene("inner");
        const middle = new Scene("middle");
        const outer = new Scene("outer");
        inner.action([mark(log, "C1")] as never);
        middle.action([
            mark(log, "B1"),
            Control.all([callingBranch(log, middle, inner)]),
            mark(log, "B2"),
        ] as never);
        outer.action([
            mark(log, "A1"),
            outer.jumpTo(middle, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, outer, [outer, middle, inner]);
        h.liveGame.newGame();
        await driveUntil(h, "C1");

        // The outer call was opened on the main stack, the inner one on a branch stack, and both
        // are held at the same time.
        expect(stage(h)).toEqual([
            { scene: "inner", suspended: false },
            { scene: "middle", suspended: true },
            { scene: "outer", suspended: true },
        ]);
        expect(h.state.getSuspendedScenes()).toEqual([middle, outer]);
        expect(h.state.getLastScene()).toBe(inner);

        await drive(h);

        expect(log).toEqual(["A1", "B1", "P1", "C1", "P2", "B2", "A2"]);
        expect(stage(h)).toEqual([{ scene: "outer", suspended: false }]);
        expect(h.state.getLastScene()).toBe(outer);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });
});

/**
 * `Control.jump` is the hot path this feature changed: it used to clear the whole main stack and
 * now clears down to the innermost `scene:resume`. Every existing game uses it, so all three shapes
 * are pinned here - no call open, a call open, and a jump taken from a branch stack, which is the
 * one place where the stack the jump reads (`getStackModelForce`, always the main one) is not the
 * stack it is running on.
 */
describe("Control.jump after the call-frame change", () => {
    it("runs the label body and drops what was queued after the jump", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.jump("tail"),
            mark(log, "skipped"),
            Control.label("tail"),
            mark(log, "T1"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "T1"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });

    it("keeps the return address when the jump is taken inside an open call", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([
            mark(log, "B1"),
            Control.jump("tail"),
            mark(log, "skipped"),
            Control.label("tail"),
            mark(log, "T1"),
        ] as never);
        main.action([
            mark(log, "A1"),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "B1", "T1", "A2"]);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getLastScene()).toBe(main);
    });

    it("moves the play head and drops the group when the jump is taken from a branch, no call open", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.all([
                Control.do([mark(log, "P1"), Control.jump("tail"), mark(log, "P2")] as never),
                Control.do([mark(log, "Q1"), mark(log, "Q2"), mark(log, "Q3"), mark(log, "Q4")] as never),
            ]),
            mark(log, "A2"),
            Control.label("tail"),
            mark(log, "T1"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drive(h);

        // The label is past the group, so the group and everything queued behind it go; the sibling
        // branch is reset where it stood rather than left rolling on its own.
        expect(log).toContain("T1");
        expect(log).not.toContain("P2");
        expect(log).not.toContain("A2");
        expect(log).not.toContain("Q4");
        expect(log[log.length - 1]).toBe("T1");
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
        expect(h.liveGame.asyncStackModels.size).toBe(0);
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
    });

    it("keeps the return address when the jump is taken from a branch inside an open call", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([
            mark(log, "B1"),
            Control.all([
                Control.do([mark(log, "P1"), Control.jump("tail"), mark(log, "P2")] as never),
                Control.do([mark(log, "Q1"), mark(log, "Q2"), mark(log, "Q3"), mark(log, "Q4")] as never),
            ]),
            mark(log, "B2"),
            Control.label("tail"),
            mark(log, "T1"),
        ] as never);
        main.action([
            mark(log, "A1"),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        // The jump ran on a branch stack and cleared the main one down to the call frame: the
        // branch group is gone, the label body runs, and the call still returns.
        expect(log).toContain("T1");
        expect(log).not.toContain("P2");
        expect(log).not.toContain("B2");
        expect(log).not.toContain("Q4");
        expect(log[log.length - 1]).toBe("A2");
        expect(log.indexOf("T1")).toBeLessThan(log.indexOf("A2"));
        expect(stage(h)).toEqual([{ scene: "main", suspended: false }]);
        expect(h.state.getLastScene()).toBe(main);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
        expect(h.liveGame.asyncStackModels.size).toBe(0);
    });
});

describe("a plain jump taken from a parallel body while a call is open", () => {
    it("gives up the whole call stack and unloads every parked scene", async () => {
        const log: string[] = [];
        const away = new Scene("away");
        const sub = new Scene("sub");
        const main = new Scene("main");
        away.action([mark(log, "C1")] as never);
        sub.action([
            mark(log, "B1"),
            Control.all([
                Control.do([mark(log, "P1"), sub.jumpTo(away), mark(log, "P2")] as never),
            ]),
            mark(log, "B2"),
        ] as never);
        main.action([
            mark(log, "A1"),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub, away]);
        h.liveGame.newGame();
        await drive(h);

        // A plain jump is one-way wherever it is taken from: it takes the frame that would have
        // returned to `main` with it, so neither the rest of the branch nor "A2" is ever reached.
        expect(log).toEqual(["A1", "B1", "P1", "C1"]);
        expect(stage(h)).toEqual([{ scene: "away", suspended: false }]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
        expect(h.state.getLastScene()).toBe(away);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
        expect(h.liveGame.asyncStackModels.size).toBe(0);
    });
});
