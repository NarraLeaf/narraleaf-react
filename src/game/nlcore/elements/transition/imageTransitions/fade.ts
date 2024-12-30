import {IImageTransition, ImgElementProp} from "../type";
import {BaseImageTransition} from "../baseTransitions";
import {ImageColor, ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";
import {toHex} from "@lib/util/data";
import {TransformDefinitions} from "@core/elements/transform/type";

export class Fade extends BaseImageTransition<ImgElementProp> implements IImageTransition {
    static Frames: [number, number] = [0, 1];
    private readonly duration: number;
    private state = {
        opacity: 1,
    };
    private src?: ImageSrc | ImageColor;
    private readonly easing: TransformDefinitions.EasingDefinition;

    /**
     * The current image will fade out, and the next image will fade in
     */
    constructor(duration: number = 1000, ease?: TransformDefinitions.EasingDefinition) {
        super();
        this.duration = duration;
        this.easing = ease || BaseImageTransition.DefaultEasing;
    }

    setSrc(src: ImageSrc | ImageColor | undefined): this {
        this.src = src;
        return this;
    }

    public start(onComplete?: () => void): void {
        this.state.opacity = Fade.Frames[0];

        this.requestAnimation({
            start: Fade.Frames[0],
            end: Fade.Frames[1],
            duration: this.duration
        }, {
            onComplete: () => {
                if (onComplete) {
                    onComplete();
                }
                this.state.opacity = Fade.Frames[1];
            },
            onUpdate: (value) => {
                this.state.opacity = value;
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
                },
            },
            {
                style: {
                    opacity: this.state.opacity,
                    backgroundColor: Utils.isColor(this.src) ? toHex(this.src) : "",
                },
                src: Utils.isImageSrc(this.src) ? Utils.srcToString(this.src) : "",
            },
        ];
    }

    copy(): Fade {
        return new Fade(this.duration, this.easing).setSrc(this.src);
    }
}


