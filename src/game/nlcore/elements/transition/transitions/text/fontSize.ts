import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";
import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";

type AnimationType = [TransitionAnimationType.Number];

export class FontSize extends TextTransition<AnimationType> {
    constructor(private textSize: number, private duration: number, private easing?: TransformDefinitions.EasingDefinition) {
        super();
    }

    createTask(): TransitionTask<HTMLSpanElement, AnimationType> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: this.getTextState().fontSize,
                end: this.textSize,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                this.asTarget<AnimationType>((fontSize: number) => ({
                    style: {
                        fontSize: `${fontSize}px`,
                    }
                })),
            ],
        };
    }

    copy(): FontSize {
        return new FontSize(this.textSize, this.duration, this.easing);
    }
}
