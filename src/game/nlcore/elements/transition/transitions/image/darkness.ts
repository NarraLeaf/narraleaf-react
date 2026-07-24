import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";

type AnimationType = [TransitionAnimationType.Number];

export type DarknessOptions = {
    /** Darkness (0–1) the image starts from. */
    from: number;
    /** Darkness (0–1) the image ends at. */
    to: number;
    /** Duration in milliseconds. */
    duration: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * Darken the original image and fade in the target image at the same time.
 * Internal: drives `image.darken(x, duration)`.
 */
export class Darkness extends ImageTransition<AnimationType> {
    private from: number;
    private to: number;
    private duration: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: DarknessOptions) {
        super();
        this.from = options.from;
        this.to = options.to;
        this.duration = options.duration;
        this.easing = options.easing;
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: this.from,
                end: this.to,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                this.asTarget<AnimationType>((darkness: number) => ({
                    style: {
                        filter: `brightness(${1 - darkness})`,
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
        return new Darkness({from: this.from, to: this.to, duration: this.duration, easing: this.easing});
    }
}
