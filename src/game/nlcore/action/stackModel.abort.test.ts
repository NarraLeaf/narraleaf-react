import { describe, expect, it, vi } from "vitest";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "./stackModel";

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Duck-typed StackModel carrying only what `execute()` touches; the real `execute`
 * prototype method is what gets exercised.
 *
 * `rollNext` hands back one queued result per iteration, and the stack reports empty
 * once they are exhausted — which is how `execute()` decides it is done.
 */
function createStackLike(results: unknown[]): StackModel {
    let index = 0;
    const stackLike = {
        liveGame: { game: { config: { maxStackModelLoop: 100 } } },
        stack: { isEmpty: () => index >= results.length },
        loopConfig: null,
        rollNext: () => results[index++] ?? null,
        execute: StackModel.prototype.execute,
    };
    return stackLike as unknown as StackModel;
}

describe("StackModel.execute - awaiting an action that gets aborted", () => {
    it("settles instead of hanging when an awaited action is aborted", async () => {
        // An in-flight animation (e.g. image.darken with a duration) that undo aborts.
        const inFlight = new Awaitable<any>(v => v);
        const settled = vi.fn();

        createStackLike([inFlight]).execute().onSettled(settled);
        await tick();
        expect(settled).not.toHaveBeenCalled();

        // `Awaitable.abort()` deliberately does not run the `then` callbacks, so awaiting
        // the awaitable itself would leave `roll()` parked here forever — and the stack
        // would never be dropped from LiveGame's asyncStackModels (it would then be
        // serialized into the save and re-executed on load).
        inFlight.abort();
        await tick();

        expect(settled).toHaveBeenCalled();
    });

    it("does not run actions queued behind an aborted one", async () => {
        const inFlight = new Awaitable<any>(v => v);
        const afterAbort = vi.fn(() => null);

        const stackLike = createStackLike([inFlight, { node: null }]);
        const rollNext = vi.spyOn(stackLike, "rollNext" as never);
        stackLike.execute();
        await tick();

        rollNext.mockClear();
        afterAbort.mockClear();
        inFlight.abort();
        await tick();

        // The aborted action was rewound; whatever was queued behind it is unreachable.
        expect(rollNext).not.toHaveBeenCalled();
    });

    it("still settles normally when the action resolves", async () => {
        const inFlight = new Awaitable<any>(v => v);
        const settled = vi.fn();

        createStackLike([inFlight]).execute().onSettled(settled);
        await tick();
        expect(settled).not.toHaveBeenCalled();

        inFlight.resolve({ node: null });
        await tick();

        expect(settled).toHaveBeenCalled();
    });

    it("propagates a failure from an awaited action", async () => {
        const inFlight = new Awaitable<any>(v => v);
        const failed = vi.fn();

        createStackLike([inFlight]).execute().onFailed(failed);
        await tick();

        inFlight.fail(new Error("boom"));
        await tick();

        expect(failed).toHaveBeenCalled();
    });
});
