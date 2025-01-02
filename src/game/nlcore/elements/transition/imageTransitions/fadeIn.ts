import {IImageTransition, ImgElementProp} from "@core/elements/transition/type";
import {BaseImageTransition} from "@core/elements/transition/baseTransitions";
import {Color, ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";
import {getCallStack, toHex} from "@lib/util/data";
import {TransformDefinitions} from "@core/elements/transform/type";

export class FadeIn extends BaseImageTransition<ImgElementProp> implements IImageTransition {
    __stack: string;
    private readonly duration: number;
    private readonly direction: "left" | "right" | "top" | "bottom";
    private readonly offset: number;
    private state = {
        opacity: 0,
        transform: ""
    };
    private src?: ImageSrc | Color;
    private readonly easing: TransformDefinitions.EasingDefinition;

    /**
     * The next image will fade-in in a direction
     * @param direction The direction the image will move from
     * @param offset The distance the image will move (in pixels)
     * @param duration The duration of the transition
     * @param easing
     */
    constructor(direction: "left" | "right" | "top" | "bottom", offset: number, duration: number = 1000, easing?: TransformDefinitions.EasingDefinition) {
        super();
        this.duration = duration;
        this.direction = direction;
        this.offset = offset;
        this.easing = easing || BaseImageTransition.DefaultEasing;
        this.__stack = getCallStack();
    }

    setSrc(src: ImageSrc | Color | undefined): this {
        this.src = src;
        return this;
    }

    public start(onComplete?: () => void): void {
        if (!this.src) {
            throw new Error("src is required, but not provided\nat:\n" + this.__stack);
        }

        this.state.opacity = 0;
        this.state.transform = this.getInitialTransform();

        this.requestAnimation({
            start: 0,
            end: 1,
            duration: this.duration
        }, {
            onComplete,
            onUpdate: (value) => {
                this.state.opacity = value;
                this.state.transform = this.getTransform(value);
            }
        }, {
            ease: this.easing,
        });
    }

    public toElementProps(): ImgElementProp[] {
        return [
            {
                style: {
                    opacity: 1,
                }
            },
            {
                style: {
                    opacity: this.state.opacity,
                    transform: this.state.transform,
                    backgroundColor: Utils.isColor(this.src) ? toHex(this.src) : "",
                },
                src: Utils.isImageSrc(this.src) ? Utils.srcToString(this.src) : "",
            }
        ];
    }

    copy(): FadeIn {
        return new FadeIn(this.direction, this.offset, this.duration, this.easing).setSrc(this.src);
    }

    private getInitialTransform(): string {
        switch (this.direction) {
            case "left":
                return `translateX(-${this.offset}px)`;
            case "right":
                return `translateX(${this.offset}px)`;
            case "top":
                return `translateY(-${this.offset}px)`;
            case "bottom":
                return `translateY(${this.offset}px)`;
            default:
                return "";
        }
    }

    private getTransform(progress: number): string {
        switch (this.direction) {
            case "left":
                return `translateX(${(1 - progress) * -this.offset}px)`;
            case "right":
                return `translateX(${(1 - progress) * this.offset}px)`;
            case "top":
                return `translateY(${(1 - progress) * -this.offset}px)`;
            case "bottom":
                return `translateY(${(1 - progress) * this.offset}px)`;
            default:
                return "";
        }
    }
}