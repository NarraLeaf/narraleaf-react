import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {irisRevealMask, maskStyle} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

export type SoftIrisOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Centre of the iris, as a CSS position. @default "50% 50%" */
    center?: string;
    /** Width of the soft (feathered) edge band, in percent. @default 12 */
    feather?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * A soft, feathered iris: the target image is revealed over the previous one
 * through an expanding `radial-gradient` circle with a feathered edge — the
 * soft-edged counterpart of {@link MaskTransition.circle}.
 */
export class SoftIris extends ImageTransition<AnimationType> {
    private duration: number;
    private center: string;
    private feather: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: SoftIrisOptions) {
        super();
        this.duration = options.duration;
        this.center = options.center ?? "50% 50%";
        this.feather = options.feather ?? 12;
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
                    style: maskStyle(irisRevealMask(this.center, this.feather, progress)),
                })),
            ],
        };
    }

    copy(): SoftIris {
        return new SoftIris({
            duration: this.duration,
            center: this.center,
            feather: this.feather,
            easing: this.easing,
        });
    }
}
