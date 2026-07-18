import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";

type AnimationType = [TransitionAnimationType.Number];

export type MaskTransitionCircleOptions = {
    duration: number;
    easing?: TransformDefinitions.EasingDefinition;
    center?: string;
    from?: number;
    to?: number;
};

export type MaskTransitionWipeOptions = {
    duration: number;
    easing?: TransformDefinitions.EasingDefinition;
    direction?: TransformDefinitions.WipeDirection;
    reverse?: boolean;
};

export class MaskTransition extends ImageTransition<AnimationType> {
    private constructor(
        private duration: number,
        private easing: TransformDefinitions.EasingDefinition | undefined,
        private clipPathResolver: (progress: number) => string
    ) {
        super();
    }

    /**
     * Reveal the target image through an animated circular clip-path.
     */
    static circle(options: MaskTransitionCircleOptions): MaskTransition {
        const {
            duration,
            easing,
            center = "50% 50%",
            from = 0,
            to = 150,
        } = options;

        return new MaskTransition(duration, easing, (progress) =>
            MaskTransition.circleClipPath(MaskTransition.lerp(from, to, progress), center)
        );
    }

    /**
     * Reveal or close the target image through an animated directional wipe.
     */
    static wipe(options: MaskTransitionWipeOptions): MaskTransition {
        const {
            duration,
            easing,
            direction = "left",
            reverse = false,
        } = options;
        const from = reverse ? 0 : 100;
        const to = reverse ? 100 : 0;

        return new MaskTransition(duration, easing, (progress) =>
            MaskTransition.wipeClipPath(direction, MaskTransition.lerp(from, to, progress))
        );
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
                this.asPrev<AnimationType>(() => ({
                    style: {
                        opacity: 1,
                        clipPath: "none",
                    },
                })),
                this.asTarget<AnimationType>((progress: number) => ({
                    style: {
                        opacity: 1,
                        clipPath: this.clipPathResolver(progress),
                    },
                })),
            ],
        };
    }

    copy(): MaskTransition {
        return new MaskTransition(this.duration, this.easing, this.clipPathResolver);
    }

    private static lerp(from: number, to: number, progress: number): number {
        return from + (to - from) * progress;
    }

    private static circleClipPath(radius: number, center: string): string {
        return `circle(${MaskTransition.formatNumber(radius)}% at ${center})`;
    }

    private static wipeClipPath(
        direction: TransformDefinitions.WipeDirection,
        amount: number
    ): string {
        const value = MaskTransition.formatNumber(amount);

        switch (direction) {
            case "right":
                return `inset(0 0 0 ${value}%)`;
            case "top":
                return `inset(0 0 ${value}% 0)`;
            case "bottom":
                return `inset(${value}% 0 0 0)`;
            case "left":
            default:
                return `inset(0 ${value}% 0 0)`;
        }
    }

    private static formatNumber(value: number): string {
        return Number.isInteger(value)
            ? String(value)
            : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }
}
