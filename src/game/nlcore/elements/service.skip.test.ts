import { describe, expect, it, vi } from "vitest";
import { Awaitable, EventDispatcher } from "@lib/util/data";
import { Service, ServiceHandlerCtx, ServiceSkeleton } from "./service";
import { SkipGate } from "@core/action/skipGate";
import { ServiceAction } from "@core/action/serviceAction";
import type { ScriptCtx } from "./script";
import type { GameState } from "@player/gameState";

/**
 * A user service's handler and the player.
 *
 * Skipping is a request the handler answers - finish now, ignore it, or refuse - while cancelling
 * (a step back, a jump, a lost `Control.any`) is done to it and cannot be refused. These sit at
 * `ServiceSkeleton.triggerAction`, the seam between the handler and the stack: what it returns is
 * what the stack waits on.
 */

const SKIP = "event:state.player.skip";
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function fakeGameState() {
    const events = new EventDispatcher<any>();
    let fastForwarding = false;
    const warnings: string[] = [];
    const gameState = {
        events,
        isFastForwarding: () => fastForwarding,
        logger: {
            weakWarn: (_tag: string, message: string) => warnings.push(message),
            warn: () => void 0,
        },
        game: {
            getLiveGame: () => ({ getStorable: () => ({ getNamespace: () => null }) }),
        },
    };
    return {
        gameState: gameState as unknown as GameState,
        warnings,
        setFastForwarding: (value: boolean) => {
            fastForwarding = value;
        },
        /** Broadcast a skip the way the player does; returns how many listeners heard it. */
        skip: (forced: boolean) => events.emit(SKIP, forced),
    };
}

type Handler = (ctx: ServiceHandlerCtx, ...args: any[]) => void | Promise<void>;

class TestService extends Service<{ run: [] }, null> {
    constructor(handler: Handler) {
        super();
        this.on("run", handler);
    }

    serialize(): null {
        return null;
    }

    deserialize(): void {
    }
}

/** Run the service's handler once, as a `ServiceAction` would. */
function run(handler: Handler, game = fakeGameState()) {
    const service = new TestService(handler) as unknown as ServiceSkeleton;
    const ctx = { gameState: game.gameState } as ScriptCtx;
    const result = service.triggerAction(ctx, "run", [] as never);
    return { game, result: result as Awaitable<void> | undefined };
}

/** A handler that holds the story until `release` is called, and exposes its ctx. */
function heldHandler() {
    let release: () => void = () => void 0;
    let ctx: ServiceHandlerCtx | null = null;
    const handler = async (c: ServiceHandlerCtx) => {
        ctx = c;
        await new Promise<void>(resolve => {
            release = resolve;
        });
    };
    return {
        handler,
        ctx: () => ctx!,
        release: () => release(),
    };
}

describe("Service — what the story waits for", () => {
    it("waits for an async handler", async () => {
        const held = heldHandler();
        const { result } = run(held.handler);

        expect(Awaitable.isAwaitable(result)).toBe(true);
        await tick();
        expect(result!.isSettled()).toBe(false);

        held.release();
        await tick();
        expect(result!.solved).toBe(true);
    });

    it("waits for a plain function that returns a promise", async () => {
        // Not declared `async`: the shape a build that compiles async functions down produces, and
        // what an arrow returning `fetch(...)` is. It used to be run and not waited for.
        let release: () => void = () => void 0;
        const { result } = run(() => new Promise<void>(resolve => {
            release = resolve;
        }));

        expect(Awaitable.isAwaitable(result)).toBe(true);
        release();
        await tick();
        expect(result!.solved).toBe(true);
    });

    it("lets the story carry on past a synchronous handler, which never listens for the player", () => {
        let ctx: ServiceHandlerCtx | null = null;
        const { game, result } = run(c => {
            ctx = c;
        });

        expect(result).toBeUndefined();
        expect(game.skip(true)).toBe(0);
        expect(ctx!.signal.aborted).toBe(false);
        expect(ctx!.skip.requested).toBe(false);
    });

    it("fails the step when the handler's promise rejects, instead of holding the story forever", async () => {
        const error = new Error("boom");
        const { result } = run(async () => {
            throw error;
        });

        await tick();
        expect(result!.isFailed()).toBe(true);
        expect(result!.error).toBe(error);
    });

    it("stops listening for the player once the run settles", async () => {
        const held = heldHandler();
        const { game } = run(held.handler);

        expect(game.skip(false)).toBe(1);
        held.release();
        await tick();
        expect(game.skip(false)).toBe(0);
    });
});

describe("Service — one subscription however many runs wait", () => {
    it("asks every waiting run through a single listener, and drops it once all have settled", async () => {
        // The skip broadcast is shared with every mounted dialog and displayable; rows waiting side
        // by side in a Control.all must not each add a listener to it.
        const game = fakeGameState();
        const first = heldHandler();
        const second = heldHandler();
        run(first.handler, game);
        run(second.handler, game);
        const heardFirst = vi.fn();
        const heardSecond = vi.fn();
        first.ctx().skip.onRequest(heardFirst);
        second.ctx().skip.onRequest(heardSecond);

        expect(game.skip(true)).toBe(1);
        expect(heardFirst).toHaveBeenCalledTimes(1);
        expect(heardSecond).toHaveBeenCalledTimes(1);

        first.release();
        await tick();
        expect(game.skip(true)).toBe(1);

        second.release();
        await tick();
        expect(game.skip(true)).toBe(0);
    });
});

describe("Service — cancellation", () => {
    it("aborts ctx.signal and runs onAbort listeners when the run is cancelled", () => {
        const held = heldHandler();
        const { result } = run(held.handler);
        const onAbort = vi.fn();
        held.ctx().onAbort(onAbort);

        result!.abort();

        expect(held.ctx().signal.aborted).toBe(true);
        expect(onAbort).toHaveBeenCalledTimes(1);
        expect(result!.isAborted()).toBe(true);
    });

    it("runs an onAbort registered after the cancellation at once", () => {
        const held = heldHandler();
        const { result } = run(held.handler);
        result!.abort();

        const late = vi.fn();
        held.ctx().onAbort(late);

        expect(late).toHaveBeenCalledTimes(1);
    });

    it("does not report the rejection a cancelled run ends with as a failure", async () => {
        // A handler that hands ctx.signal to fetch ends with an AbortError once it is cancelled.
        const { result } = run(ctx => new Promise<void>((_resolve, reject) => {
            ctx.signal.addEventListener("abort", () => reject(new Error("AbortError")));
        }));

        result!.abort();
        await tick();

        expect(result!.isAborted()).toBe(true);
        expect(result!.isFailed()).toBe(false);
    });

    it("stops listening for the player once cancelled", () => {
        const held = heldHandler();
        const { game, result } = run(held.handler);

        result!.abort();

        expect(game.skip(true)).toBe(0);
    });
});

describe("Service — the player asking a handler to hurry", () => {
    it("tells a handler only what is new: the first request, then the first forced one", () => {
        const held = heldHandler();
        const { game } = run(held.handler);
        const listener = vi.fn();
        held.ctx().skip.onRequest(listener);

        game.skip(false);
        game.skip(false);
        expect(listener.mock.calls).toEqual([[{ forced: false }]]);
        expect(held.ctx().skip.requested).toBe(true);
        expect(held.ctx().skip.forced).toBe(false);

        game.skip(true);
        game.skip(true);
        game.skip(false);
        expect(listener.mock.calls).toEqual([[{ forced: false }], [{ forced: true }]]);
        expect(held.ctx().skip.forced).toBe(true);
    });

    it("starts at forced when the first request is already the skip mode", () => {
        const held = heldHandler();
        const { game } = run(held.handler);
        const listener = vi.fn();
        held.ctx().skip.onRequest(listener);

        game.skip(true);
        game.skip(false);

        expect(listener.mock.calls).toEqual([[{ forced: true }]]);
    });

    it("tells a listener registered after a request at once", () => {
        const held = heldHandler();
        const { game } = run(held.handler);
        game.skip(true);

        const late = vi.fn();
        held.ctx().skip.onRequest(late);

        expect(late.mock.calls).toEqual([[{ forced: true }]]);
    });

    it("stops telling a listener whose token was cancelled", () => {
        const held = heldHandler();
        const { game } = run(held.handler);
        const listener = vi.fn();
        held.ctx().skip.onRequest(listener).cancel();

        game.skip(true);

        expect(listener).not.toHaveBeenCalled();
    });

    it("settles the step when the handler answers a request by finishing", async () => {
        const { game, result } = run(async ctx => {
            await new Promise<void>(resolve => ctx.skip.onRequest(() => resolve()));
        });

        game.skip(true);
        await tick();

        expect(result!.solved).toBe(true);
    });

    it("does not settle the step for a handler that ignores the request", async () => {
        const held = heldHandler();
        const { game, result } = run(held.handler);

        game.skip(true);
        await tick();

        expect(result!.isSettled()).toBe(false);
    });

    it("reads whether the game is fast-forwarding live", () => {
        const held = heldHandler();
        const { game } = run(held.handler);

        expect(held.ctx().skip.fastForwarding).toBe(false);
        game.setFastForwarding(true);
        expect(held.ctx().skip.fastForwarding).toBe(true);
    });

    it("fails the step when a request listener throws, rather than the skip key", async () => {
        const error = new Error("listener");
        const held = heldHandler();
        const { game, result } = run(held.handler);
        held.ctx().skip.onRequest(() => {
            throw error;
        });

        expect(() => game.skip(true)).not.toThrow();
        expect(result!.isFailed()).toBe(true);
        expect(result!.error).toBe(error);
    });
});

describe("Service — refusing to be skipped", () => {
    it("shows a refusal on the gate of what the stack waits for, until it is released", () => {
        const held = heldHandler();
        const { result } = run(held.handler);
        const gate = SkipGate.of(result!)!;
        expect(gate.isRefused()).toBe(false);

        const release = held.ctx().skip.refuse("waiting for the minigame");
        expect(gate.isRefused()).toBe(true);
        expect(gate.getRefusal()).toBe("waiting for the minigame");

        release();
        expect(gate.isRefused()).toBe(false);
    });

    it("stays refused until every refusal is released", () => {
        const held = heldHandler();
        const { result } = run(held.handler);
        const gate = SkipGate.of(result!)!;

        const first = held.ctx().skip.refuse("first");
        const second = held.ctx().skip.refuse("second");
        expect(gate.getRefusal()).toBe("second");

        second();
        expect(gate.isRefused()).toBe(true);
        expect(gate.getRefusal()).toBe("first");

        first();
        expect(gate.isRefused()).toBe(false);
    });

    it("warns that a synchronous handler has nothing to refuse", () => {
        const { game } = run(ctx => {
            ctx.skip.refuse();
        });

        expect(game.warnings).toHaveLength(1);
    });

    it("carries the refusal to the awaitable a ServiceAction puts on the stack", () => {
        const game = fakeGameState();
        const service = new TestService(async ctx => {
            ctx.skip.refuse("held");
            await new Promise<void>(() => void 0);
        });
        const action = (service.trigger("run") as any).getActions()[0] as ServiceAction;
        expect(action).toBeInstanceOf(ServiceAction);

        const onStack = action.executeAction(game.gameState, {} as never);

        expect(Awaitable.isAwaitable(onStack)).toBe(true);
        expect(SkipGate.of(onStack as object)?.getRefusal()).toBe("held");
    });
});
