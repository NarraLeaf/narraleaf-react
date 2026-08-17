import {CSSProps, TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {clamp01} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

export type ExposureOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /**
     * Peak exposure in stops, driving the frame to a gain of `2 ** ev`. Every channel
     * clips at white on the way, so a channel already near white blows out almost at
     * once while a dark one holds on nearly to the end — the difference between this
     * and a white plate. @default 4.6
     */
    ev?: number;
    /**
     * Shadow lift (0–1) mixed in ahead of the gain, ramped in with it.
     *
     * Gain alone never whitens pure black, so without a lift a night frame ends the
     * burn as a black silhouette on white. This is the flare a real lens adds; 0.03–0.06
     * carries the shadows up without touching the frame at rest. @default 0.04
     */
    lift?: number;
    /** Fraction (0–1) of the duration spent fully blown out. @default 0 */
    hold?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * An exposure transition: the outgoing frame is driven up in stops until it burns out
 * to white, the images swap inside that white window, and the incoming frame comes
 * back down to a normal exposure.
 *
 * Unlike a white plate faded over the frame — which moves every colour toward white at
 * one rate — the whitening here is per-channel clipping, so highlights go first,
 * saturated colours pass through a hue shift as their leading channel clips, and the
 * shadows are the last thing left. {@link ThroughColor} with a white colour is the
 * plate version; this is the photographic one.
 *
 * Emitted as a plain CSS `filter` chain, so it drives an `<img>` and a detached scene
 * root alike. `invert brightness invert` is a lift with no clipping of its own
 * (`c → lift + (1 - lift)·c`); the trailing `brightness` is the gain that does clip.
 */
export class Exposure extends ImageTransition<AnimationType> {
    private duration: number;
    private ev: number;
    private lift: number;
    private hold: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: ExposureOptions) {
        super();
        this.duration = options.duration;
        this.ev = options.ev ?? 4.6;
        this.lift = options.lift ?? 0.04;
        this.hold = options.hold ?? 0;
        this.easing = options.easing;
    }

    /**
     * Style for a frame at a given burn amount (0 = untouched, 1 = fully blown out).
     *
     * The lift is scaled by the burn rather than applied flat, so a resting frame is
     * bit-for-bit the source image and writes no filter at all — a filter left on a
     * settled scene root would give it a compositing layer for nothing.
     */
    private burnStyle(burn: number): CSSProps {
        const amount = clamp01(burn);
        if (amount <= 0) {
            return {filter: "none"};
        }
        const lift = clamp01(this.lift) * amount;
        const gain = Math.pow(2, Math.max(0, this.ev) * amount);
        return {
            filter: `invert(1) brightness(${1 - lift}) invert(1) brightness(${gain})`,
        };
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        const hold = clamp01(this.hold);
        const burnEnd = (1 - hold) / 2; // fully blown out by here
        const coolStart = 1 - burnEnd; // starts coming back down here
        const mid = 0.5; // inside the blown-out window → swap the images here, unseen

        // Burn amount (0–1) of whichever half is on screen: up → hold → down.
        const burnAt = (progress: number): number => {
            if (progress <= burnEnd) return burnEnd <= 0 ? 1 : progress / burnEnd;
            if (progress >= coolStart) return coolStart >= 1 ? 1 : (1 - progress) / (1 - coolStart);
            return 1;
        };

        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                // Previous image: burns out, then hands over inside the white window.
                this.asPrev<AnimationType>((progress: number) => ({
                    style: {
                        opacity: progress < mid ? 1 : 0,
                        ...this.burnStyle(burnAt(progress)),
                    },
                })),
                // Target image: taken over already blown out, cooling down to normal.
                this.asTarget<AnimationType>((progress: number) => ({
                    style: {
                        opacity: progress < mid ? 0 : 1,
                        ...this.burnStyle(burnAt(progress)),
                    },
                })),
            ],
        };
    }

    copy(): Exposure {
        return new Exposure({
            duration: this.duration,
            ev: this.ev,
            lift: this.lift,
            hold: this.hold,
            easing: this.easing,
        });
    }
}
