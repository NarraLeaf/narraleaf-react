import {BaseTextTransition} from "@core/elements/transition/baseTransitions";
import {ITextTransition, SpanElementProp} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";

/**@deprecated */
export class FontSizeTransition extends BaseTextTransition<SpanElementProp> implements ITextTransition {
    static Frames: [number, number] = [1, 0];
    private readonly duration: number;
    private state = {
        fontSize: 0,
    };
    private readonly easing: TransformDefinitions.EasingDefinition | undefined;
    private readonly startValue: number;
    private readonly endValue: number;

    constructor(start: number, end: number, duration: number = 1000, easing?: TransformDefinitions.EasingDefinition) {
        super();
        this.startValue = start;
        this.endValue = end;
        this.duration = duration;
        this.easing = easing;
    }

    public start(onComplete?: () => void): void {
        this.state.fontSize = this.startValue;

        this.requestAnimation({
            start: this.startValue,
            end: this.endValue,
            duration: this.duration
        }, {
            onComplete: () => {
                this.state.fontSize = this.endValue;
                if (onComplete) {
                    onComplete();
                }
            },
            onUpdate: (value) => {
                this.state.fontSize = value;
            },
        }, {
            ease: this.easing,
        });
    }

    public toElementProps(): SpanElementProp[] {
        return [
            {
                style: {fontSize: this.state.fontSize},
            },
        ];
    }

    copy(): FontSizeTransition {
        return new FontSizeTransition(this.startValue, this.endValue, this.duration, this.easing);
    }
}
