import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {clamp01} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

export type BlurDissolveOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Peak blur radius applied at the crossover, in pixels. @default 16 */
    blur?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * A blur dissolve: the previous image blurs out and fades while the target one
 * sharpens in — the dreamy crossfade used for flashbacks / dream states.
 */
export class BlurDissolve extends ImageTransition<AnimationType> {
    private duration: number;
    private blur: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: BlurDissolveOptions) {
        super();
        this.duration = options.duration;
        this.blur = options.blur ?? 16;
        this.easing = options.easing;
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        const max = Math.max(0, this.blur);
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                this.asPrev<AnimationType>((progress: number) => ({
                    style: {
                        opacity: 1 - clamp01(progress),
                        filter: `blur(${max * clamp01(progress)}px)`,
                    },
                })),
                this.asTarget<AnimationType>((progress: number) => ({
                    style: {
                        opacity: clamp01(progress),
                        filter: `blur(${max * (1 - clamp01(progress))}px)`,
                    },
                })),
            ],
        };
    }

    copy(): BlurDissolve {
        return new BlurDissolve({
            duration: this.duration,
            blur: this.blur,
            easing: this.easing,
        });
    }
}
