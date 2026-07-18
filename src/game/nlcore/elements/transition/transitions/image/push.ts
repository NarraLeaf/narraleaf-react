import {CSSProps, TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {clamp01} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

export type PushOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Direction the previous image travels toward. @default "left" */
    direction?: TransformDefinitions.WipeDirection;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * A push / slide: the target image slides in from one edge while the previous
 * image slides out the opposite way, as if the camera panned.
 *
 * The offset is applied via the independent CSS `translate` property (not
 * `transform`) in viewport units. That composes additively with the layer's
 * base positioning instead of overriding it, and is the identity at offset `0`,
 * so neither image jumps at the start/end of the slide.
 */
export class Push extends ImageTransition<AnimationType> {
    private duration: number;
    private direction: TransformDefinitions.WipeDirection;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: PushOptions) {
        super();
        this.duration = options.duration;
        this.direction = options.direction ?? "left";
        this.easing = options.easing;
    }

    private axisUnit(): { axis: "x" | "y"; unit: "vw" | "vh"; sign: number } {
        switch (this.direction) {
        case "right":
            return {axis: "x", unit: "vw", sign: 1};
        case "top":
            return {axis: "y", unit: "vh", sign: -1};
        case "bottom":
            return {axis: "y", unit: "vh", sign: 1};
        case "left":
        default:
            return {axis: "x", unit: "vw", sign: -1};
        }
    }

    private translate(offset: number): CSSProps {
        const {axis, unit} = this.axisUnit();
        const value = `${offset}${unit}`;
        return {translate: axis === "x" ? `${value} 0px` : `0px ${value}`};
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        const {sign} = this.axisUnit();
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                // Previous image slides from rest out toward `direction` (0 → ±100).
                this.asPrev<AnimationType>((progress: number) => ({
                    style: this.translate(sign * 100 * clamp01(progress)),
                })),
                // Target image slides in from the opposite edge to rest (∓100 → 0).
                this.asTarget<AnimationType>((progress: number) => ({
                    style: this.translate(-sign * 100 * (1 - clamp01(progress))),
                })),
            ],
        };
    }

    copy(): Push {
        return new Push({
            duration: this.duration,
            direction: this.direction,
            easing: this.easing,
        });
    }
}
