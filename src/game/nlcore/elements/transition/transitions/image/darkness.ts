import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {holdFraction, resolveEasing} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

export type DarknessOptions = {
    /** Darkness (0–1) the image starts from. */
    from: number;
    /** Darkness (0–1) the image ends at. */
    to: number;
    /** Duration in milliseconds. */
    duration: number;
    /**
     * Time held at `from` before the brightness starts moving, in milliseconds, taken out of
     * `duration`. `{from: 1, to: 0, duration: 3000, holdMs: 2000}` is two seconds of black and
     * then a one-second lift out of it.
     *
     * The hold sits at `from` and not at `to` because `from` is where the image swap happens -
     * the incoming frame is already on screen at the very first tick. That makes this the same
     * thing {@link ThroughColor} and {@link Exposure} call a hold: the window the swap hides in.
     * @default 0
     */
    holdMs?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * A brightness-dim transition: swaps to the incoming image and animates its
 * brightness from `1 - from` to `1 - to` (darkness `0` leaves it untouched, `1`
 * drives it fully black), replacing the outgoing image at once.
 *
 * This is what backs `image.darken(amount, duration)` — darkening an image in
 * place is expressed as a transition from its current darkness to the new one.
 *
 * ⚠ The brightness is only worn for as long as the transition runs. What a
 * settled element looks like is the element's own business — an image renders at
 * `Image.state.darkness`, a scene root at nothing at all — so a run ending at a
 * `to` above zero snaps back to full brightness on its last frame unless
 * something else is holding that darkness. Ending dark is what a black
 * background (or {@link ThroughColor} with no uncover) is for; this is a way
 * *through* a darkness, not a way to sit in one.
 *
 * The channel is a linear 0-1 progress and the easing is applied by hand, so
 * that {@link DarknessOptions.holdMs} can be real time rather than a share of an
 * eased curve.
 */
export class Darkness extends ImageTransition<AnimationType> {
    private from: number;
    private to: number;
    private duration: number;
    private holdMs: number | undefined;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: DarknessOptions) {
        super();
        this.from = options.from;
        this.to = options.to;
        this.duration = options.duration;
        this.holdMs = options.holdMs;
        this.easing = options.easing;
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        const held = holdFraction({duration: this.duration, holdMs: this.holdMs});
        const ease = resolveEasing(this.easing);
        // Darkness at a point of the linear run: `from` for as long as the hold lasts, then the
        // eased ramp to `to` over whatever is left.
        const darknessAt = (progress: number): number => {
            if (progress <= held) return this.from;
            if (held >= 1) return this.from;
            return this.from + (this.to - this.from) * ease((progress - held) / (1 - held));
        };

        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                // Linear on purpose: `darknessAt` owns the easing so the hold can be real time.
                ease: "linear",
            }],
            resolve: [
                this.asTarget<AnimationType>((progress: number) => ({
                    style: {
                        filter: `brightness(${1 - darknessAt(progress)})`,
                    },
                })),
                this.asPrev<AnimationType>(() => ({
                    style: {
                        opacity: 0,
                    },
                    height: 0,
                    width: 0,
                })),
            ],
        };
    }

    copy(): Darkness {
        return new Darkness({
            from: this.from,
            to: this.to,
            duration: this.duration,
            holdMs: this.holdMs,
            easing: this.easing,
        });
    }
}
