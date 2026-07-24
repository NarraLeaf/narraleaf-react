import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";
import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";

type AnimationType = [TransitionAnimationType.Number];

export type FontSizeOptions = {
    /** Font size (px) the text transitions to. */
    fontSize: number;
    /** Duration in milliseconds. */
    duration: number;
    easing?: TransformDefinitions.EasingDefinition;
};

export class FontSize extends TextTransition<AnimationType> {
    private fontSize: number;
    private duration: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: FontSizeOptions) {
        super();
        this.fontSize = options.fontSize;
        this.duration = options.duration;
        this.easing = options.easing;
    }

    createTask(): TransitionTask<HTMLSpanElement, AnimationType> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: this.getTextState().fontSize,
                end: this.fontSize,
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
        return new FontSize({fontSize: this.fontSize, duration: this.duration, easing: this.easing});
    }
}
