import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";
import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";

export class FontSize extends TextTransition<[TransitionAnimationType.Number]> {
    constructor(private textSize: number, private duration: number, private easing?: TransformDefinitions.EasingDefinition) {
        super();
    }

    createTask(): TransitionTask<HTMLSpanElement, [TransitionAnimationType.Number]> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: this.getTextState().fontSize,
                end: this.textSize,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                (fontSize: number) => ({
                    style: {
                        fontSize: fontSize,
                    }
                }),
            ],
        };
    }

    copy(): FontSize {
        return new FontSize(this.textSize, this.duration, this.easing);
    }
}
