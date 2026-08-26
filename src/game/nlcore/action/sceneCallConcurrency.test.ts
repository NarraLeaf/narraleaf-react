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
 * Two returnable jumps taken from the same scene at the same time.
 *
 * A concurrent group runs each branch on a stack of its own, so both branches of a `Control.all` can
 * reach a returnable jump before either of them returns. The stage cannot hold that: one `Scene` has
 * one place on it and one suspension flag, so the second call parks a scene that is already parked
 * and the first return un-parks it while the second call is still open. What followed was not an
 * error - the first branch went on happily, the second was left waiting on a line attached to a
 * scene nobody was looking at any more, and because `Control.all` waits on every branch, the story
 * simply stopped advancing.
 *
 * `Control.any` hides the same thing: it settles on the first branch that drains, so a branch that
 * can never drain is never noticed. That contrast is the whole reason this is refused rather than
 * left to the stage to sort out.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    log: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/** A wait that never ends, so a branch can be held in a known place. */
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
 * Roll the main stack the way `Player.tsx` does, and hand back what the first concurrent group did:
 * whether it settled, and the error it failed with if it did not settle cleanly.
 */
async function driveToGroup(h: Harness, steps: number = 40): Promise<{
    settled: boolean;
    failed: boolean;
    error: unknown;
}> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveToGroup: the story ended before a group (log: ${h.log.join(",")})`);
        }
        // `next()` also reports the game lock, which nothing here takes.
        const result = h.liveGame.next() as CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null;
        if (
            StackModel.isCalledActionResult(result)
            && result.wait
            && StackModel.isStackModelsAwaiting(result.wait.type, result.wait.stackModels)
        ) {
            const group = StackModel.executeStackModelGroup(result.wait.type, result.wait.stackModels);
            for (let j = 0; j < 40 && !group.isSettled(); j++) {
                await tick();
            }
            return { settled: group.isSettled(), failed: group.isFailed(), error: group.error };
        }
        await tick();
    }
    throw new Error(`driveToGroup: no group appeared (log: ${h.log.join(",")})`);
}

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

/** Both branches of one group call a scene, each from the same caller. */
function twoCallsAtOnce(kind: "all" | "any") {
    const log: string[] = [];
    const one = new Scene("one");
    const two = new Scene("two");
    const main = new Scene("main");
    one.action([mark(log, "B1"), Control.sleep(forever()), mark(log, "B2")] as never);
    two.action([mark(log, "C1"), Control.sleep(forever()), mark(log, "C2")] as never);
    const group = kind === "all" ? Control.all : Control.any;
    main.action([
        mark(log, "A1"),
        group([
            Control.do([main.jumpTo(one, { returnable: true }), mark(log, "P1")] as never),
            Control.do([main.jumpTo(two, { returnable: true }), mark(log, "P2")] as never),
        ]),
        mark(log, "A2"),
    ] as never);
    return { log, main, scenes: [main, one, two] };
}

describe("two returnable jumps taken from the same scene at once", () => {
    it("is refused rather than left to wedge the story", async () => {
        const { log, main, scenes } = twoCallsAtOnce("all");
        const h = harness(log, main, scenes);

        h.liveGame.newGame();
        const group = await driveToGroup(h);

        // The group settles - it does not hang - and it settles by failing, which is what puts the
        // reason in front of whoever wrote the story.
        expect(group.settled).toBe(true);
        expect(group.failed).toBe(true);
        expect(String((group.error as Error)?.message)).toContain("already parked behind another call");
        expect(String((group.error as Error)?.message)).toContain("main");
    });

    it("is refused under Control.any too, where the refusal used to be swallowed", async () => {
        const { log, main, scenes } = twoCallsAtOnce("any");
        const h = harness(log, main, scenes);

        h.liveGame.newGame();
        const group = await driveToGroup(h);

        expect(group.settled).toBe(true);
        expect(group.failed).toBe(true);
        expect(String((group.error as Error)?.message)).toContain("already parked behind another call");
    });

    it("still allows a call taken from the scene a call is running in", async () => {
        // The nested shape, which looks similar and is not: the caller of the inner jump is the
        // scene the story is actually in, and nothing about it is parked.
        const log: string[] = [];
        const inner = new Scene("inner");
        const sub = new Scene("sub");
        const main = new Scene("main");
        inner.action([mark(log, "C1")] as never);
        sub.action([mark(log, "B1"), sub.jumpTo(inner, { returnable: true }), mark(log, "B2")] as never);
        main.action([
            mark(log, "A1"),
            Control.all([
                Control.do([main.jumpTo(sub, { returnable: true }), mark(log, "P1")] as never),
                Control.do([mark(log, "Q1")] as never),
            ]),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main, [main, sub, inner]);
        h.liveGame.newGame();
        const group = await driveToGroup(h);

        expect(group.failed).toBe(false);
        expect(group.settled).toBe(true);
        expect(log).toEqual(["A1", "Q1", "B1", "C1", "B2", "P1"]);
    });
});
