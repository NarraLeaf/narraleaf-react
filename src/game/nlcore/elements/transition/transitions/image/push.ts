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
 * `transform`) in **percentages of the layer's own size**. That composes
 * additively with the layer's base positioning instead of overriding it, and is
 * the identity at offset `0`, so neither image jumps at the start/end of the slide.
 *
 * Percentages — not viewport units — matter here: whichever element this drives
 * lives inside the letterboxed stage box. On the layered render path that element
 * is the transition stack wrapper (`inset: 0`, see `Image.tsx` `stackStyle`); on the
 * non-layered path the style is applied to the `<img>` itself. A `100vw`/`100vh`
 * travel is measured against the *window*, so whenever the window aspect differs
 * from the design aspect the slide overshoots the stage and exposes the backdrop
 * mid-transition. `100%` is measured against that element, so either way a full
 * slide lands exactly one stage width/height away regardless of window shape.
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

    private axisSign(): { axis: "x" | "y"; sign: number } {
        switch (this.direction) {
        case "right":
            return {axis: "x", sign: 1};
        case "top":
            return {axis: "y", sign: -1};
        case "bottom":
            return {axis: "y", sign: 1};
        case "left":
        default:
            return {axis: "x", sign: -1};
        }
    }

    private translate(offset: number): CSSProps {
        const {axis} = this.axisSign();
        const value = `${offset}%`;
        return {translate: axis === "x" ? `${value} 0px` : `0px ${value}`};
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        const {sign} = this.axisSign();
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
