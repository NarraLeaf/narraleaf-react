import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {GameState} from "@player/gameState";

type AnimationType = [TransitionAnimationType.Number, TransitionAnimationType.Number, TransitionAnimationType.Number];

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
    /**
     * Fade in the target image with an optional position start position
     * @param startPos start position offset
     * @param duration duration in milliseconds
     * @param easing easing definition or existing easing name
     */
    constructor(
        private duration: number,
        private startPos: [xOffset: number, yOffset: number] = [0, 0],
        private easing?: TransformDefinitions.EasingDefinition
    ) {
        super();
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
                    start: this.startPos[0],
                    end: 0,
                    duration: this.duration,
                    ease: this.easing,
                },
                {
                    type: TransitionAnimationType.Number,
                    start: this.startPos[1],
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
        return new FadeIn(this.duration, this.startPos, this.easing);
    }
}
