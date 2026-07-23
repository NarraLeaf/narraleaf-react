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
