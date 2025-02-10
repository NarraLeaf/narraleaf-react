import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Utils} from "@core/common/Utils";
import {GameState} from "@player/gameState";

type AnimationType = [TransitionAnimationType.Number, TransitionAnimationType.Number, TransitionAnimationType.Number];

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
                        ...Utils.offset(
                            ["50%", "50%"],
                            [xOffset, yOffset],
                            gameState.getStory().getInversionConfig()
                        ),
                        transform: "translate(-50%, 50%)",
                    },
                })),
            ],
        };
    }

    copy(): FadeIn {
        return new FadeIn(this.duration, this.startPos, this.easing);
    }
}
