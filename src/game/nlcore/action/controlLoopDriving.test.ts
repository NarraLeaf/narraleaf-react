import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Control, Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "./stackModel";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * `Control.repeat` and `Control.whileLoop` run their body on a `StackModel` of their own, and that
 * stack asks the loop for another iteration when it drains ({@link StackModel.execute} →
 * `onIterationComplete`). Which caller notices the drain decides whether the loop loops, and there
 * are two callers:
 *
 * - `StackModel.execute()` rolls a stack to exhaustion and gives the loop its next iteration every
 *   time the stack empties. **This is the path the shipped player uses**: `Player.tsx` hands any
 *   still-waiting concurrent group - and a loop is one, a single-branch `all` - to
 *   `StackModel.executeStackModelGroup`, which runs each branch under `execute()`.
 * - `StackModel.rollNext()` advances one step per call. Its group path reads a drained branch as
 *   "the group is finished", and a loop that has drained between iterations looks exactly like one.
 *
 * So a loop reached through `rollNext` alone runs its body once. Nothing in the engine drives a
 * loop that way - `LiveGame.next()` is only ever called by the player, which hands the group off
 * before advancing - and both behaviours are pinned below so that the difference is a decision
 * rather than an accident. The one-pass case is the shape a test harness falls into if it calls
 * `LiveGame.next()` in a loop and ignores the hand-off; it is not what a game does.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** What the bodies ran, in order. */
    log: string[];
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

    // Stand in for the React tree - see sceneCallControlFlow.test.ts, where the same stub is
    // explained: both halves of a scene entering the stage park on a mounted component.
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
        } as never);
    });
    void scenes;
    return { game, state, liveGame, log };
}

/**
 * Roll the main stack the way `Player.tsx` does: `LiveGame.next()`, and a result that is a
 * still-waiting concurrent group is handed to `StackModel.executeStackModelGroup`.
 */
async function drivePlayer(h: Harness, steps: number = 200): Promise<void> {
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
                    throw new Error("drivePlayer: parked on an awaitable that never settled");
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
                throw new Error(`drivePlayer: the group never completed (log: ${h.log.join(",")})`);
            }
        }
        await tick();
    }
    throw new Error(`drivePlayer: ran out of steps (log: ${h.log.join(",")})`);
}

/** Roll the main stack with nothing but `LiveGame.next()`, with no hand-off to `execute()`. */
async function driveBare(h: Harness, steps: number = 200): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
            if (!result.isSettled()) {
                throw new Error("driveBare: parked on an awaitable that never settled");
            }
        }
        await tick();
    }
    throw new Error(`driveBare: ran out of steps (log: ${h.log.join(",")})`);
}

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

describe("Control.repeat runs its body once per iteration", () => {
    function repeatStory(times: number) {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.repeat(times, [mark(log, "P")]),
            mark(log, "A2"),
        ] as never);
        return { log, main };
    }

    it("runs the body as many times as it was asked", async () => {
        const { log, main } = repeatStory(3);
        const h = harness(log, main, [main]);

        h.liveGame.newGame();
        await drivePlayer(h);

        expect(log).toEqual(["A1", "P", "P", "P", "A2"]);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
        expect(h.liveGame.asyncStackModels.size).toBe(0);
    });

    it("runs the body once when asked for one iteration", async () => {
        const { log, main } = repeatStory(1);
        const h = harness(log, main, [main]);

        h.liveGame.newGame();
        await drivePlayer(h);

        expect(log).toEqual(["A1", "P", "A2"]);
    });

    it("keeps a multi-action body in order across iterations", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            Control.repeat(2, [mark(log, "P"), mark(log, "Q")]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drivePlayer(h);

        expect(log).toEqual(["P", "Q", "P", "Q", "A2"]);
    });

    it("stops at Control.breakLoop in the middle of an iteration", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            Control.repeat(5, [mark(log, "P"), Control.breakLoop(), mark(log, "unreachable")]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drivePlayer(h);

        expect(log).toEqual(["P", "A2"]);
    });
});

describe("Control.whileLoop runs until its condition goes false", () => {
    function whileStory() {
        const log: string[] = [];
        const counter = { n: 0 };
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.whileLoop(() => counter.n < 3, [
                Script.execute(() => {
                    counter.n++;
                    log.push(`P${counter.n}`);
                }),
            ]),
            mark(log, "A2"),
        ] as never);
        return { log, main, counter };
    }

    it("runs the body until the condition stops holding", async () => {
        const { log, main, counter } = whileStory();
        const h = harness(log, main, [main]);

        h.liveGame.newGame();
        await drivePlayer(h);

        expect(log).toEqual(["A1", "P1", "P2", "P3", "A2"]);
        expect(counter.n).toBe(3);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });

    it("never enters a body whose condition is already false", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.whileLoop(() => false, [mark(log, "unreachable")]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drivePlayer(h);

        expect(log).toEqual(["A1", "A2"]);
    });
});

/**
 * A loop is followed by a marker in every body below. A concurrent group whose result carries no
 * chained child is dropped by `executeActions` before it reaches the stack - it keeps only results
 * that name an action - so a loop written as the last statement of a block does not run at all.
 * That is a separate defect, and not what this file is about.
 */
describe("a loop nested inside a concurrent group", () => {
    it("repeats inside a Control.all branch", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.all([
                Control.do([Control.repeat(3, [mark(log, "P")]), mark(log, "R")] as never),
                Control.do([mark(log, "Q")] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drivePlayer(h);

        expect(log.filter(entry => entry === "P")).toHaveLength(3);
        expect(log.indexOf("R")).toBeGreaterThan(log.lastIndexOf("P"));
        expect(log[0]).toBe("A1");
        expect(log[log.length - 1]).toBe("A2");
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });

    it("repeats inside an async body", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.doAsync([Control.repeat(3, [mark(log, "P")]), mark(log, "R")] as never),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drivePlayer(h);
        // The async body outlives the main stack draining; give it the ticks it needs.
        for (let i = 0; i < 20 && h.liveGame.asyncStackModels.size > 0; i++) {
            await tick();
        }

        expect(log.filter(entry => entry === "P")).toHaveLength(3);
        expect(h.liveGame.asyncStackModels.size).toBe(0);
    });
});

/**
 * The other half of the header: what a loop does when nothing hands its group to `execute()`.
 *
 * Pinned so that the difference between the two drivers is visible, and so that anyone who changes
 * `rollNext`'s group path has to decide what they mean rather than discovering it. A game never
 * reaches a loop this way.
 */
describe("a loop advanced one rollNext at a time", () => {
    it("runs a repeat body once, whatever the count says", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.repeat(3, [mark(log, "P")]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await driveBare(h);

        expect(log).toEqual(["A1", "P", "A2"]);
    });

    it("runs a while body once, whatever the condition says", async () => {
        const log: string[] = [];
        const counter = { n: 0 };
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Control.whileLoop(() => counter.n < 3, [
                Script.execute(() => {
                    counter.n++;
                    log.push(`P${counter.n}`);
                }),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await driveBare(h);

        expect(log).toEqual(["A1", "P1", "A2"]);
    });
});
