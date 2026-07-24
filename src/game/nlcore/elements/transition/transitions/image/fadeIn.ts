import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {GameState} from "@player/gameState";

type AnimationType = [TransitionAnimationType.Number, TransitionAnimationType.Number, TransitionAnimationType.Number];

export type FadeInOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Pixel offset the target travels in from, as `[x, y]`. @default [0, 0] */
    offset?: [xOffset: number, yOffset: number];
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * A fade in, optionally travelling from a pixel offset to rest.
 *
 * The offset rides on the independent CSS `translate` property (not `transform`,
 * and not `left`/`top`) for the same reason as {@link Push}: it composes additively
 * with whatever base positioning the driven element already has, and it is the
 * identity at offset `0`. Writing `transform` here instead would overwrite that
 * base — a layered image's stack wrapper is positioned by `inset: 0` and carries
 * no transform of its own, so a leftover `transform` from this transition would
 * survive the crossfade and displace the settled stack.
 */
export class FadeIn extends ImageTransition<AnimationType> {
    private duration: number;
    private offset: [xOffset: number, yOffset: number];
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: FadeInOptions) {
        super();
        this.duration = options.duration;
        this.offset = options.offset ?? [0, 0];
        this.easing = options.easing;
    }

    createTask(gameState: GameState): TransitionTask<HTMLImageElement, AnimationType> {
        // An inverted axis measures from the opposite edge, so a positive offset travels the
        // other way — mirror that by negating it rather than by swapping left/right, top/bottom.
        const {invertX, invertY} = gameState.getStory().getInversionConfig();
        return {
            animations: [
                {
                    type: TransitionAnimationType.Number,
                    start: 0,
                    end: 1,
                    duration: this.duration,
                    ease: this.easing,
                },
                {
                    type: TransitionAnimationType.Number,
                    start: this.offset[0],
                    end: 0,
                    duration: this.duration,
                    ease: this.easing,
                },
                {
                    type: TransitionAnimationType.Number,
                    start: this.offset[1],
                    end: 0,
                    duration: this.duration,
                    ease: this.easing,
                }
            ],
            resolve: [
                this.asPrev<AnimationType>(() => ({})),
                this.asTarget<AnimationType>((opacity: number, xOffset, yOffset) => ({
                    style: {
                        opacity: opacity,
                        translate: `${invertX ? -xOffset : xOffset}px ${invertY ? -yOffset : yOffset}px`,
                    },
                })),
            ],
        };
    }

    copy(): FadeIn {
        return new FadeIn({duration: this.duration, offset: this.offset, easing: this.easing});
    }
}
