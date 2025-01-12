import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";

type DissolveAnimation = [TransitionAnimationType.Number];

export class Dissolve extends ImageTransition<DissolveAnimation> {
    constructor(private duration: number, private easing?: TransformDefinitions.EasingDefinition) {
        super();
    }

    createTask(): TransitionTask<HTMLImageElement, DissolveAnimation> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                this.asPrev<DissolveAnimation>((opacity: number) => ({
                    style: {
                        opacity: 1 - opacity,
                    }
                })),
                this.asTarget<DissolveAnimation>((opacity: number) => ({
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
