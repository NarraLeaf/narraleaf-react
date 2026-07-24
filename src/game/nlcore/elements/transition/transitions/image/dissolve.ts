import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";

type AnimationType = [TransitionAnimationType.Number];

export type DissolveOptions = {
    /** Duration in milliseconds. */
    duration: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * Fade out the original image and fade in the target image at the same time.
 */
export class Dissolve extends ImageTransition<AnimationType> {
    private duration: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: DissolveOptions) {
        super();
        this.duration = options.duration;
        this.easing = options.easing;
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                this.asPrev<AnimationType>((opacity: number) => ({
                    style: {
                        opacity: 1 - opacity,
                    }
                })),
                this.asTarget<AnimationType>((opacity: number) => ({
                    style: {
                        opacity: opacity,
                    },
                })),
            ],
        };
    }

    copy(): Dissolve {
        return new Dissolve({duration: this.duration, easing: this.easing});
    }
}
