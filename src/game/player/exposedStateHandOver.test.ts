import { describe, expect, it } from "vitest";
import { GameState } from "@player/gameState";
import type { ExposedKeys, ExposedState, ExposedStateType } from "@player/type";

/**
 * How `getExposedStateAsync` hands a component's state to the action that is waiting for it.
 *
 * Both halves of the contract are load-bearing and neither is visible from the call site, which is
 * why they are pinned here:
 *
 * - **Not in the caller's own task.** `mountState` runs inside the component's mount effect, so a
 *   synchronous hand-over made starting a scene one unbroken chain of commits and React threw
 *   `Maximum update depth exceeded` at about twenty-five displayables. The hand-over has to reach
 *   the event loop.
 * - **The state that is mounted when the hand-over happens**, not the one the event carried. React
 *   mounts an effect, tears it down and mounts it again under `StrictMode`; taking the announced
 *   one leaves the action holding the throwaway mount and waiting for ever.
 *
 * Driven through a stub `this`, the idiom the other `GameState` tests use: a real one needs a live
 * game and a mounted React stage, and none of that is what these assertions are about.
 */

type Handler = (key: unknown, state: unknown) => void;

type HandOverThis = {
    exposed: Map<unknown, unknown>;
    handlers: Handler[];
    events: { on: (event: unknown, handler: Handler) => { cancel: () => void } };
    getExposedState: (key: unknown) => unknown;
};

function createThis(): HandOverThis {
    const self: HandOverThis = {
        exposed: new Map(),
        handlers: [],
        events: {
            on: (_event, handler) => {
                self.handlers.push(handler);
                return {
                    cancel: () => {
                        const at = self.handlers.indexOf(handler);
                        if (at >= 0) {
                            self.handlers.splice(at, 1);
                        }
                    },
                };
            },
        },
        getExposedState: key => self.exposed.get(key) ?? null,
    };
    return self;
}

/** What `mountState` does that this path can see: record the state, then announce it. */
function mount(self: HandOverThis, key: unknown, state: unknown): void {
    self.exposed.set(key, state);
    for (const handler of [...self.handlers]) {
        handler(key, state);
    }
}

function unmount(self: HandOverThis, key: unknown): void {
    self.exposed.delete(key);
}

function waitFor(self: HandOverThis, key: unknown, onExpose: (state: unknown) => void) {
    return GameState.prototype.getExposedStateAsync.call(
        self as unknown as GameState,
        key as ExposedKeys[ExposedStateType],
        onExpose as (state: ExposedState[ExposedStateType]) => void,
    );
}

/** One turn of the event loop - what the hand-over is deliberately deferred by. */
function nextTurn(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe("GameState.getExposedStateAsync", () => {
    it("does not hand over inside the mount that announced the state", async () => {
        const self = createThis();
        const seen: unknown[] = [];

        waitFor(self, "image-1", state => seen.push(state));
        mount(self, "image-1", { id: "first" });

        expect(seen).toEqual([]);
        await nextTurn();
        expect(seen).toEqual([{ id: "first" }]);
    });

    it("hands over the state that is mounted a turn later, not the one that was announced", async () => {
        const self = createThis();
        const seen: unknown[] = [];

        waitFor(self, "image-1", state => seen.push(state));
        // The StrictMode shape: mount, throw that mount away, mount again.
        mount(self, "image-1", { id: "throwaway" });
        unmount(self, "image-1");
        mount(self, "image-1", { id: "real" });

        await nextTurn();
        expect(seen).toEqual([{ id: "real" }]);
    });

    it("keeps waiting when the state is gone again by the time the hand-over runs", async () => {
        const self = createThis();
        const seen: unknown[] = [];

        waitFor(self, "image-1", state => seen.push(state));
        mount(self, "image-1", { id: "throwaway" });
        unmount(self, "image-1");

        await nextTurn();
        expect(seen).toEqual([]);

        mount(self, "image-1", { id: "real" });
        await nextTurn();
        expect(seen).toEqual([{ id: "real" }]);
    });

    it("defers a state that is already mounted, and hands it over once", async () => {
        const self = createThis();
        const seen: unknown[] = [];

        self.exposed.set("image-1", { id: "already" });
        waitFor(self, "image-1", state => seen.push(state));

        expect(seen).toEqual([]);
        await nextTurn();
        expect(seen).toEqual([{ id: "already" }]);

        // A later remount must not hand over a second time.
        mount(self, "image-1", { id: "again" });
        await nextTurn();
        expect(seen).toEqual([{ id: "already" }]);
    });

    it("cancels a hand-over that has been scheduled but has not run", async () => {
        const self = createThis();
        const seen: unknown[] = [];

        const token = waitFor(self, "image-1", state => seen.push(state));
        mount(self, "image-1", { id: "first" });
        token.cancel();

        await nextTurn();
        expect(seen).toEqual([]);
        expect(self.handlers).toEqual([]);
    });
});
