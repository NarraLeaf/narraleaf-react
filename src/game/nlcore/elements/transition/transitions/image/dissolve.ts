import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";

export class Dissolve extends ImageTransition<[TransitionAnimationType.Number]> {
    constructor(private duration: number, private easing?: TransformDefinitions.EasingDefinition) {
        super();
    }

    createTask(): TransitionTask<HTMLImageElement, [TransitionAnimationType.Number]> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                (opacity: number) => this.withCurrentSrc({
                    style: {
                        opacity: 1 - opacity,
                    }
                }),
                (opacity: number) => this.withTargetSrc({
                    style: {
                        opacity: opacity,
                    }
                }),
            ],
        };
    }
}
