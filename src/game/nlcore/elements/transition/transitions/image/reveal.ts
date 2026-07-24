import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Mask, MaskPattern} from "@core/elements/transition/transitions/image/mask";

type AnimationType = [TransitionAnimationType.Number];

export type RevealOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** The coverage geometry the target is revealed through. See {@link Mask}. */
    pattern: MaskPattern;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * The direct-cut engine: the target image is revealed over the previous one
 * through any {@link MaskPattern}, with no colour hold in between — the
 * "A→B" counterpart of {@link ThroughColor}.
 *
 * The geometry lives entirely in the pattern, so the same {@link Mask} factory
 * moves a scene change between the two families with a one-word edit:
 * ```ts
 * new Reveal({duration: 1200, pattern: Mask.clock()})
 * new ThroughColor({duration: 1800, pattern: Mask.clock()})
 * ```
 */
export class Reveal extends ImageTransition<AnimationType> {
    private duration: number;
    private pattern: MaskPattern;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: RevealOptions) {
        super();
        this.duration = options.duration;
        this.pattern = options.pattern;
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
                    style: Mask.toStyle(this.pattern, progress),
                })),
            ],
        };
    }

    copy(): Reveal {
        return new Reveal({
            duration: this.duration,
            pattern: this.pattern,
            easing: this.easing,
        });
    }
}
