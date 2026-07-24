import { describe, expect, it } from "vitest";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "@core/action/stackModel";
import { LiveGame } from "@core/common/game";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * WI-2: fastForward({ until: { actionId } }) — jump the play head to a specific action id,
 * stopping just before it runs, with an explicit reachedTarget flag so the caller can tell a
 * successful jump from an unreachable / already-passed id.
 *
 * The fastForward loop is renderer-driven, so it is exercised via a scripted stand-in for
 * gameState + stackModel and `LiveGame.prototype.fastForward.call(...)` (the same duck-typing
 * approach as stackModel.abort.test.ts). peekTopActionId — the new StackModel primitive the jump
 * relies on — is covered directly against a real StackModel.
 */

function fakeLiveGame(): LiveGame {
    return {
        game: { config: { maxStackModelLoop: 100, app: { debug: false } } },
        getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
    } as unknown as LiveGame;
}

const pendingAction = (id: string): CalledActionResult =>
    ({ type: "character:say", node: { action: { getId: () => id, type: "character:say" } }, wait: null } as unknown as CalledActionResult);

describe("StackModel.peekTopActionId", () => {
    it("returns null for an empty stack", () => {
        expect(new StackModel(fakeLiveGame()).peekTopActionId()).toBeNull();
    });

    it("returns the top action's id", () => {
        const s = new StackModel(fakeLiveGame());
        s.push(pendingAction("a"));
        s.push(pendingAction("b"));
        expect(s.peekTopActionId()).toBe("b");
    });

    it("skips an awaitable sitting above the action (does not throw)", () => {
        const s = new StackModel(fakeLiveGame());
        s.push(pendingAction("a"));
        s.push(new Awaitable<CalledActionResult>()); // suspended, no underlying action
        expect(s.peekTopActionId()).toBe("a");
    });
});

describe("StackModel.peekExecutingActionId", () => {
    it("returns null for an empty stack", () => {
        expect(new StackModel(fakeLiveGame()).peekExecutingActionId()).toBeNull();
    });

    it("returns the top action id when the top item is a plain action", () => {
        const s = new StackModel(fakeLiveGame());
        s.push(pendingAction("a"));
        s.push(pendingAction("b"));
        expect(s.peekExecutingActionId()).toBe("b");
    });

    it("returns null when a suspended step sits on top — unlike peekTopActionId, it does not peek beneath", () => {
        const s = new StackModel(fakeLiveGame());
        s.push(pendingAction("a")); // a continuation buried under an in-progress step
        s.push(new Awaitable<CalledActionResult>());
        expect(s.peekExecutingActionId()).toBeNull();
        expect(s.peekTopActionId()).toBe("a"); // the walk-past probe still surfaces the buried id
    });
});

/**
 * Scripted play head: `ids` is the sequence of root actions; each stage.next() (or a skip of a
 * suspended step) advances the cursor by one. peekTopActionId reflects the cursor.
 */
function scriptedGame(
    ids: string[],
    opts: { menuAt?: number; suspendAt?: number[] } = {},
): LiveGame {
    let cursor = 0;
    let pendingSettle: (() => void) | null = null;
    const suspend = new Set(opts.suspendAt ?? []);

    const stackModel = {
        isEmpty: () => cursor >= ids.length,
        peekTopActionId: () => (cursor < ids.length ? ids[cursor] : null),
        // The execution front: null while the current line is suspended (an awaitable on top).
        peekExecutingActionId: () =>
            cursor < ids.length && !suspend.has(cursor) ? ids[cursor] : null,
        getWaitingAwaitable: () =>
            cursor < ids.length && suspend.has(cursor)
                ? { onSettled: (cb: () => void) => { pendingSettle = cb; } }
                : null,
    };

    const gameState = {
        game: { config: { maxStackModelLoop: 100 } },
        audioManager: { getGlobalVolume: () => 1, setGlobalVolume: () => void 0 },
        setFastForwarding: () => void 0,
        hasActiveMenu: () => opts.menuAt !== undefined && cursor >= opts.menuAt,
        events: {
            emit: () => {
                // A skip settles the suspended step and advances one line.
                if (pendingSettle) {
                    const cb = pendingSettle;
                    pendingSettle = null;
                    cursor++;
                    cb();
                }
            },
        },
        stage: { next: () => { cursor++; } },
    };

    const lg: any = Object.create(LiveGame.prototype);
    lg.assertGameState = () => void 0;
    lg.gameState = gameState;
    lg.stackModel = stackModel;
    return lg as LiveGame;
}

describe("LiveGame.fastForward — until: { actionId }", () => {
    it("stops just before the target action and reports reachedTarget", async () => {
        const lg = scriptedGame(["a", "b", "c", "d"]);
        const result = await lg.fastForward({ until: { actionId: "c" } });
        expect(result).toEqual({ reason: "action", reachedTarget: true });
    });

    it("no-ops when already positioned at the target", async () => {
        const lg = scriptedGame(["c", "d"]);
        const result = await lg.fastForward({ until: { actionId: "c" } });
        expect(result).toEqual({ reason: "action", reachedTarget: true });
    });

    it("skips a suspended line on the way to the target", async () => {
        const lg = scriptedGame(["a", "b", "c"], { suspendAt: [0] });
        const result = await lg.fastForward({ until: { actionId: "c" } });
        expect(result).toEqual({ reason: "action", reachedTarget: true });
    });

    it("reports end + reachedTarget:false for an unreachable / already-passed id", async () => {
        const lg = scriptedGame(["a", "b"]);
        const result = await lg.fastForward({ until: { actionId: "zzz" } });
        expect(result).toEqual({ reason: "end", reachedTarget: false });
    });

    it("reports menu + reachedTarget:false when a menu blocks the path", async () => {
        const lg = scriptedGame(["a", "b", "c"], { menuAt: 1 });
        const result = await lg.fastForward({ until: { actionId: "c" } });
        expect(result).toEqual({ reason: "menu", reachedTarget: false });
    });

    it("reports maxSteps + reachedTarget:false when the cap is hit first", async () => {
        const lg = scriptedGame(["a", "b", "c", "d"]);
        const result = await lg.fastForward({ until: { actionId: "d" }, maxSteps: 2 });
        expect(result).toEqual({ reason: "maxSteps", reachedTarget: false });
    });
});

/**
 * WI-0 nit: a target buried under an in-progress step must not false-positive. The scripted
 * cursor model above cannot express "target visible to peekTopActionId while an awaitable is on
 * top", so this uses a bespoke two-phase stand-in — the shape the M4 review flagged as untestable.
 */
describe("LiveGame.fastForward — actionId buried under an in-progress step", () => {
    it("waits for the in-progress step to settle before matching the continuation", async () => {
        // Models Control.do([say, ...]) whose tail is the target 't': while the say runs, an
        // awaitable sits on top and 't' is buried beneath. peekTopActionId would see 't' and stop
        // immediately (the bug); peekExecutingActionId returns null until 't' surfaces to the front.
        let phase = 0; // 0: in progress (awaitable on top); 1: settled ('t' at the execution front)
        let pendingSettle: (() => void) | null = null;
        const stackModel = {
            isEmpty: () => false,
            peekTopActionId: () => "t",
            peekExecutingActionId: () => (phase === 0 ? null : "t"),
            getWaitingAwaitable: () =>
                phase === 0 ? { onSettled: (cb: () => void) => { pendingSettle = cb; } } : null,
        };
        const gameState = {
            game: { config: { maxStackModelLoop: 100 } },
            audioManager: { getGlobalVolume: () => 1, setGlobalVolume: () => void 0 },
            setFastForwarding: () => void 0,
            hasActiveMenu: () => false,
            events: {
                emit: () => {
                    if (pendingSettle) {
                        const cb = pendingSettle;
                        pendingSettle = null;
                        phase = 1; // the in-progress step settled; 't' surfaces to the front
                        cb();
                    }
                },
            },
            stage: { next: () => void 0 },
        };
        const lg: any = Object.create(LiveGame.prototype);
        lg.assertGameState = () => void 0;
        lg.gameState = gameState;
        lg.stackModel = stackModel;

        const result = await lg.fastForward({ until: { actionId: "t" } });
        expect(result).toEqual({ reason: "action", reachedTarget: true });
        expect(phase).toBe(1); // proves it skipped the in-progress step, not false-matched at phase 0
    });
});

describe("LiveGame.fastForward — string modes stay backward-compatible", () => {
    it("until:'menu' (default) returns a bare { reason } with no reachedTarget", async () => {
        const lg = scriptedGame(["a", "b", "c"], { menuAt: 1 });
        const result = await lg.fastForward();
        expect(result).toEqual({ reason: "menu" });
    });

    it("until:'end' drains the stack", async () => {
        const lg = scriptedGame(["a", "b"]);
        const result = await lg.fastForward({ until: "end" });
        expect(result).toEqual({ reason: "end" });
    });
});
