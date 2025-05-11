import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";

type AnimationType = [TransitionAnimationType.Number];

export class Darkness extends ImageTransition<AnimationType> {
    /**
     * Darken the original image and fade in the target image at the same time.
     * @param darkness darkness of the image, between 0 and 1
     * @param duration duration in milliseconds
     * @param easing easing definition or existing easing name
     */
    constructor(private prevDarkness: number, private targetDarkness: number, private duration: number, private easing?: TransformDefinitions.EasingDefinition) {
        super();
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: this.prevDarkness,
                end: this.targetDarkness,
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
                    }
                })),
            ],
        };
    }

    copy(): Darkness {
        return new Darkness(this.prevDarkness, this.targetDarkness, this.duration, this.easing);
    }
}
