import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {BlindsOrientation, blindsCoverMask, maskStyle} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

export type BlindsOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Slat orientation. @default "horizontal" */
    orientation?: BlindsOrientation;
    /** Number of slats. @default 8 */
    slats?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * Venetian "blinds": the target image is revealed over the previous one through
 * a set of hard-edged slats that widen until they cover the frame.
 */
export class Blinds extends ImageTransition<AnimationType> {
    private duration: number;
    private orientation: BlindsOrientation;
    private slats: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: BlindsOptions) {
        super();
        this.duration = options.duration;
        this.orientation = options.orientation ?? "horizontal";
        this.slats = options.slats ?? 8;
        this.easing = options.easing;
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
                this.asPrev<AnimationType>(() => ({})),
                this.asTarget<AnimationType>((progress: number) => ({
                    style: maskStyle(blindsCoverMask(this.orientation, this.slats, progress)),
                })),
            ],
        };
    }

    copy(): Blinds {
        return new Blinds({
            duration: this.duration,
            orientation: this.orientation,
            slats: this.slats,
            easing: this.easing,
        });
    }
}
