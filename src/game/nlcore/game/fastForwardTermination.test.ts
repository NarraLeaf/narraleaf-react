import { describe, expect, it } from "vitest";
import { LiveGame } from "@core/common/game";
import { SkipGate } from "@core/action/skipGate";

/**
 * `LiveGame.fastForward` must always settle.
 *
 * The shape these cover is the one the seam tests in `fastForwardTarget.test.ts` cannot: an
 * awaitable that does **not** respond to the first skip broadcast. In the real player that is the
 * normal case, not an exotic one — `event:state.player.skip` is fire-and-forget and only the
 * *mounted* dialog honours it, while the fast-forward loop resumes on a microtask, long before the
 * renderer has committed the line it just started. The single emit the loop used to send therefore
 * reached no listener at all, nothing settled the step, and the returned promise never settled
 * either (measured at 73s+ in NarraLeaf-Studio's "Skip to next choice").
 */

/** Resolve to "HUNG" rather than letting a non-terminating fastForward hold the suite hostage. */
function withHangGuard<T>(promise: Promise<T>, ms = 2000): Promise<T | "HUNG"> {
    return Promise.race([
        promise,
        new Promise<"HUNG">(resolve => setTimeout(() => resolve("HUNG"), ms)),
    ]);
}

/**
 * A play head parked on a single suspended line.
 *
 * `settleOnEmit` is the ordinal of the skip broadcast that finally settles the line — `1` is a
 * renderer that was already mounted, `3` models the dialog mounting a couple of frames later, and
 * `null` models a step that cannot be skipped at all. Once it settles the stack drains, so a run
 * that gets past the line reports `"end"`.
 *
 * `onEmit` runs on every skip broadcast before the line decides whether it settles, for a step that
 * answers a request some other way - by refusing it.
 */
function suspendedGame(settleOnEmit: number | null, onEmit?: (emit: number) => void) {
    let emits = 0;
    let settled = false;
    let fastForwarding = false;
    const volumes: number[] = [];
    const settleListeners: (() => void)[] = [];

    const awaitable = {
        onSettled(callback: () => void) {
            if (settled) {
                callback();
                return { cancel: () => void 0 };
            }
            settleListeners.push(callback);
            return {
                cancel: () => {
                    const index = settleListeners.indexOf(callback);
                    if (index !== -1) {
                        settleListeners.splice(index, 1);
                    }
                },
            };
        },
    };

    const stackModel = {
        isEmpty: () => settled,
        peekTopActionId: () => (settled ? null : "a"),
        peekExecutingActionId: () => null,
        getWaitingAwaitable: () => (settled ? null : awaitable),
    };

    const gameState = {
        game: { config: { maxStackModelLoop: 100 } },
        audioManager: {
            getGlobalVolume: () => 1,
            setGlobalVolume: (value: number) => {
                volumes.push(value);
            },
        },
        setFastForwarding: (value: boolean) => {
            fastForwarding = value;
        },
        hasActiveMenu: () => false,
        logger: { info: () => void 0 },
        events: {
            emit: () => {
                emits++;
                onEmit?.(emits);
                if (settleOnEmit !== null && emits >= settleOnEmit) {
                    settled = true;
                    settleListeners.splice(0).forEach(callback => callback());
                }
            },
        },
        stage: { next: () => void 0 },
    };

    const lg: any = Object.create(LiveGame.prototype);
    lg.assertGameState = () => void 0;
    lg.gameState = gameState;
    lg.stackModel = stackModel;

    return {
        lg: lg as LiveGame,
        awaitable,
        emitCount: () => emits,
        isFastForwarding: () => fastForwarding,
        volumes,
    };
}

describe("LiveGame.fastForward — always terminates", () => {
    it("reports 'stalled' instead of hanging when the suspended step never answers a skip", async () => {
        const game = suspendedGame(null);

        const result = await withHangGuard(
            game.lg.fastForward({ until: "menu", stepTimeout: 80 }),
        );

        expect(result).toEqual({ reason: "stalled" });
        // The give-up path must still be a normal return: a run that leaves the game muted and
        // stuck in fast-forward mode is the other half of what "frozen" looked like.
        expect(game.isFastForwarding()).toBe(false);
        expect(game.volumes.at(-1)).toBe(1);
    });

    it("carries reachedTarget:false through a stall for an actionId jump", async () => {
        const game = suspendedGame(null);

        const result = await withHangGuard(
            game.lg.fastForward({ until: { actionId: "zzz" }, stepTimeout: 80 }),
        );

        expect(result).toEqual({ reason: "stalled", reachedTarget: false });
    });

    it("keeps re-issuing the skip until the renderer is mounted to honour it", async () => {
        // The dialog for the line the loop just started mounts a couple of frames later; only the
        // third broadcast reaches a listener. One emit and a park would never get past this line.
        const game = suspendedGame(3);

        const result = await withHangGuard(
            game.lg.fastForward({ until: "menu", stepTimeout: 1000 }),
        );

        expect(result).toEqual({ reason: "end" });
        expect(game.emitCount()).toBe(3);
    });

    it("costs no extra frame when the step settles on the first skip", async () => {
        const game = suspendedGame(1);

        const result = await withHangGuard(
            game.lg.fastForward({ until: "menu", stepTimeout: 1000 }),
        );

        expect(result).toEqual({ reason: "end" });
        expect(game.emitCount()).toBe(1);
    });
});

describe("LiveGame.fastForward — a step that refuses to be skipped", () => {
    it("stops at once with 'refused' and the step's message, without asking it again", async () => {
        const game = suspendedGame(null);
        const gate = new SkipGate();
        gate.refuse("waiting for the minigame");
        SkipGate.attach(game.awaitable, gate);

        const result = await withHangGuard(
            game.lg.fastForward({ until: "menu", stepTimeout: 1000 }),
        );

        expect(result).toEqual({ reason: "refused", refusal: "waiting for the minigame" });
        // Already refused: a broadcast now would only skip whatever is on the stage beside it.
        expect(game.emitCount()).toBe(0);
        expect(game.isFastForwarding()).toBe(false);
        expect(game.volumes.at(-1)).toBe(1);
    });

    it("stops when the step refuses in answer to the request", async () => {
        const gate = new SkipGate();
        const game = suspendedGame(null, () => {
            gate.refuse();
        });
        SkipGate.attach(game.awaitable, gate);

        const result = await withHangGuard(
            game.lg.fastForward({ until: { actionId: "zzz" }, stepTimeout: 1000 }),
        );

        // No message was given, so there is none to report.
        expect(result).toEqual({ reason: "refused", reachedTarget: false });
        expect(game.emitCount()).toBe(1);
    });

    it("asks again once a refusal is released, and reports 'stalled' if nothing more happens", async () => {
        const gate = new SkipGate();
        const game = suspendedGame(null);
        SkipGate.attach(game.awaitable, gate);
        gate.refuse("loading")();

        const result = await withHangGuard(
            game.lg.fastForward({ until: "menu", stepTimeout: 80 }),
        );

        expect(result).toEqual({ reason: "stalled" });
        expect(game.emitCount()).toBeGreaterThan(0);
    });
});
