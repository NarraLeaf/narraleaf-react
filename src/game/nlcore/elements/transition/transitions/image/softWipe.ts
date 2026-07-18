import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {linearWipeMask, maskStyle} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

export type SoftWipeOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Direction the wipe travels toward. @default "left" */
    direction?: TransformDefinitions.WipeDirection;
    /** Width of the soft (feathered) edge band, in percent. @default 12 */
    feather?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * A soft, feathered directional wipe. The target image is revealed over the
 * previous one through a moving `linear-gradient` alpha mask, giving a gradual
 * erase rather than the hard geometric cut of {@link MaskTransition.wipe}.
 */
export class SoftWipe extends ImageTransition<AnimationType> {
    private duration: number;
    private direction: TransformDefinitions.WipeDirection;
    private feather: number;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: SoftWipeOptions) {
        super();
        this.duration = options.duration;
        this.direction = options.direction ?? "left";
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
                    style: maskStyle(linearWipeMask(this.direction, this.feather, progress)),
                })),
            ],
        };
    }

    copy(): SoftWipe {
        return new SoftWipe({
            duration: this.duration,
            direction: this.direction,
            feather: this.feather,
            easing: this.easing,
        });
    }
}
