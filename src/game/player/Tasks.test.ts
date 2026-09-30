import { describe, expect, it } from "vitest";
import { Awaitable, SkipController } from "@lib/util/data";
import { GameStateGuard, GuardWarningType } from "@player/guard";
import { Timeline } from "@player/Tasks";

/**
 * How a timeline settles when its awaitable and its children do not settle together.
 *
 * Every action that waits on an animation is built the same way: the action's own awaitable, with a
 * skip controller, as the timeline, and the animation's timeline as its child. When the animation
 * finishes it resolves the action first and itself one step later, so for that one step the
 * timeline has a resolved awaitable and a child still running. A line whose voice outlives it is
 * the same shape stretched over seconds.
 *
 * `Awaitable.resolve` retires the skip controller with `cancel()`, and a cancelled controller
 * reports `isAborted()`. The timeline read that as an abort, called itself cancelled - firing its
 * cancel listeners - and then refused the `resolved` the child brought, with the guard's
 * "Trying to resolve a settled timeline: cancelled -> resolved" on the console. That was every
 * transform and transition in a story, one warning each.
 */

function guard(): GameStateGuard {
    return new GameStateGuard({
        [GuardWarningType.invalidExposedStateUnmounting]: true,
        [GuardWarningType.unexpectedTimelineStatusChange]: true,
    });
}

/** The shape `DisplayableAction.applyTransform` and `ImageAction`'s transitions build. */
function actionOverAnimation(g: GameStateGuard) {
    const action = new Awaitable<string>()
        .registerSkipController(new SkipController(() => "skipped"));
    const animation = new Awaitable<void>()
        .registerSkipController(new SkipController(() => void 0));
    const child = new Timeline(animation);
    const timeline = new Timeline(action, g).attachChild(child);
    const events: string[] = [];
    timeline.onResolved(() => events.push("resolved"));
    timeline.onCancelled(() => events.push("cancelled"));
    return { action, animation, child, timeline, events };
}

describe("a timeline whose awaitable resolves before its child", () => {
    it("waits for the child and then resolves, without a warning", () => {
        const g = guard();
        const { action, animation, timeline, events } = actionOverAnimation(g);

        // The order the transition controller uses: the action's callback, then the animation.
        action.resolve("done");
        expect(timeline.status).toBe("pending");
        expect(events).toEqual([]);

        animation.resolve();
        expect(timeline.status).toBe("resolved");
        expect(events).toEqual(["resolved"]);
        expect(g.getWarnings()).toEqual([]);
    });

    it("still cancels when the animation is skipped before the action resolves", () => {
        const g = guard();
        const { animation, timeline, events } = actionOverAnimation(g);

        animation.abort();
        // The child is cancelled; the action itself is neither resolved nor aborted yet.
        expect(timeline.status).toBe("pending");

        timeline.abort();
        expect(timeline.status).toBe("cancelled");
        expect(events).toEqual(["cancelled"]);
        expect(g.getWarnings()).toEqual([]);
    });
});

describe("aborting a timeline", () => {
    it("cancels it once when its awaitable has a skip controller", () => {
        const g = guard();
        const awaitable = new Awaitable<void>()
            .registerSkipController(new SkipController(() => void 0));
        const timeline = new Timeline(awaitable, g);
        const events: string[] = [];
        timeline.onCancelled(() => events.push("cancelled"));

        // What `Timelines.abortAll` does to everything still running on a new game or a load.
        timeline.abort();

        expect(timeline.status).toBe("cancelled");
        expect(events).toEqual(["cancelled"]);
        expect(g.getWarnings()).toEqual([]);
    });

    it("cancels one whose awaitable has no skip controller", () => {
        const g = guard();
        const timeline = new Timeline(new Awaitable<void>(), g);

        timeline.abort();

        expect(timeline.status).toBe("cancelled");
        expect(g.getWarnings()).toEqual([]);
    });

    it("stays cancelled when the children it aborts settle afterwards", () => {
        const g = guard();
        const { action, child, timeline, events } = actionOverAnimation(g);

        // Resolved, but the child is still running: an undo or a reset lands here.
        action.resolve("done");
        timeline.abort();

        expect(child.status).toBe("cancelled");
        expect(timeline.status).toBe("cancelled");
        expect(events).toEqual(["cancelled"]);
        expect(g.getWarnings()).toEqual([]);
    });
});

describe("a timeline whose child fails", () => {
    it("fails, and hands the child's error on", () => {
        const g = guard();
        const action = new Awaitable<void>()
            .registerSkipController(new SkipController(() => void 0));
        const animation = new Awaitable<void>();
        const timeline = new Timeline(action, g).attachChild(animation);
        const errors: unknown[] = [];
        timeline.onFailed(error => errors.push(error));

        const error = new Error("boom");
        animation.fail(error);

        expect(timeline.status).toBe("failed");
        expect(errors).toEqual([error]);
        expect(g.getWarnings()).toEqual([]);
    });
});
