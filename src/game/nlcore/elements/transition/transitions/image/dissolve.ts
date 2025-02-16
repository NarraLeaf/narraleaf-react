import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";

type AnimationType = [TransitionAnimationType.Number];

export class Dissolve extends ImageTransition<AnimationType> {
    /**
     * Fade out the original image and fade in the target image at the same time.
     * @param duration duration in milliseconds
     * @param easing easing definition or existing easing name
     */
    constructor(private duration: number, private easing?: TransformDefinitions.EasingDefinition) {
        super();
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
        return new Dissolve(this.duration, this.easing);
    }
}
