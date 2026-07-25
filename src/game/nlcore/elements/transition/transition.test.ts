import { describe, expect, it, vi } from "vitest";
import { Transition } from "@core/elements/transition/transition";
import { AnimationTaskMapArray, TransitionAnimationType, TransitionTask } from "@core/elements/transition/type";
import { GameState } from "@player/gameState";

type AnimationType = [TransitionAnimationType.Number, TransitionAnimationType.Number];

// The transition itself is irrelevant here — these tests pin the controller lifecycle that
// `useDisplayable` relies on now that the animation start is gated on element loading:
// completion/cancellation can be requested BEFORE `start()` (a skip during the load wait, or
// the next transition interrupting this one), and a start that lost that race must be a no-op.
class TestTransition extends Transition<HTMLElement, AnimationType> {
    createTask(_gameState: GameState): TransitionTask<HTMLElement, AnimationType> {
        return {
            animations: TestTransition.animations(),
            resolve: [
                this.asPrev<AnimationType>(() => ({})),
                this.asTarget<AnimationType>(() => ({})),
            ],
        };
    }

    static animations(): AnimationTaskMapArray<AnimationType> {
        return [
            { type: TransitionAnimationType.Number, start: 0, end: 1, duration: 100 },
            { type: TransitionAnimationType.Number, start: 5, end: 9, duration: 100 },
        ];
    }

    copy(): TestTransition {
        return new TestTransition();
    }
}

describe("transition animation controller lifecycle", () => {
    it("complete() before start() defers; start() then settles straight to the end values", () => {
        const controller = new TestTransition().requestAnimations(TestTransition.animations());
        const onUpdate = vi.fn();
        const onComplete = vi.fn();
        controller.onUpdate(onUpdate);
        controller.onComplete(onComplete);

        controller.complete();
        // Not yet: the request waits for the elements to be mounted and loaded, because the
        // settled frame shows the target and tearing down pre-commit corrupts the groups.
        expect(onComplete).not.toHaveBeenCalled();

        controller.start();

        expect(onUpdate).toHaveBeenCalledWith([1, 9]);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("start() after a deferred completion does not animate further", () => {
        const controller = new TestTransition().requestAnimations(TestTransition.animations());
        const onUpdate = vi.fn();
        controller.onUpdate(onUpdate);

        controller.complete();
        controller.start();
        const updates = onUpdate.mock.calls.length;

        expect(() => controller.start()).not.toThrow();
        expect(onUpdate).toHaveBeenCalledTimes(updates);
    });

    it("complete() is idempotent once settled", () => {
        const controller = new TestTransition().requestAnimations(TestTransition.animations());
        const onComplete = vi.fn();
        controller.onComplete(onComplete);

        controller.complete();
        controller.start();
        controller.complete();

        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("cancel() before start() blocks the start and never completes", () => {
        const controller = new TestTransition().requestAnimations(TestTransition.animations());
        const onUpdate = vi.fn();
        const onComplete = vi.fn();
        const onCanceled = vi.fn();
        controller.onUpdate(onUpdate);
        controller.onComplete(onComplete);
        controller.onCanceled(onCanceled);

        controller.cancel();

        expect(onCanceled).toHaveBeenCalledTimes(1);
        expect(() => controller.start()).not.toThrow();
        expect(onUpdate).not.toHaveBeenCalled();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it("complete() after cancel() stays cancelled", () => {
        const controller = new TestTransition().requestAnimations(TestTransition.animations());
        const onComplete = vi.fn();
        controller.onComplete(onComplete);

        controller.cancel();
        controller.complete();

        expect(onComplete).not.toHaveBeenCalled();
    });
});
