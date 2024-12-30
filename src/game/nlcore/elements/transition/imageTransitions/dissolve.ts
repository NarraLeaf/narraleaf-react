import {IImageTransition, ImgElementProp} from "../type";
import {BaseImageTransition} from "../baseTransitions";
import {ImageColor, ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";
import {toHex} from "@lib/util/data";
import {TransformDefinitions} from "@core/elements/transform/type";

/**
 * @class Dissolve
 * @implements ITransition
 * @extends BaseTransition
 * @description Dissolve transition effect
 */
export class Dissolve extends BaseImageTransition<ImgElementProp> implements IImageTransition {
    static Frames: [number, number] = [1, 0];
    private readonly duration: number;
    private state = {
        opacity: 0,
    };
    private src?: ImageSrc | ImageColor;
    private readonly easing: TransformDefinitions.EasingDefinition;

    /**
     * Image will dissolve from one image to another
     */
    constructor(duration: number = 1000, easing?: TransformDefinitions.EasingDefinition) {
        super();
        this.duration = duration;
        this.easing = easing || BaseImageTransition.DefaultEasing;
    }

    setSrc(src: ImageSrc | ImageColor | undefined): this {
        this.src = src;
        return this;
    }

    public start(onComplete?: () => void): void {
        this.state.opacity = Dissolve.Frames[0];

        this.requestAnimation({
            start: Dissolve.Frames[0],
            end: Dissolve.Frames[1],
            duration: this.duration
        }, {
            onComplete: () => {
                this.state.opacity = Dissolve.Frames[1];
                if (onComplete) {
                    onComplete();
                }
            },
            onUpdate: (value) => {
                this.state.opacity = value;
            },
        }, {
            ease: this.easing,
        });
    }

    public toElementProps(): ImgElementProp[] {
        return [
            {
                style: {opacity: this.state.opacity},
            },
            {
                style: {
                    opacity: 1 - this.state.opacity,
                    backgroundColor: Utils.isColor(this.src) ? toHex(this.src) : "",
                },
                src: Utils.isImageSrc(this.src) ? Utils.srcToString(this.src) : "",
            },
        ];
    }

    copy(): Dissolve {
        return new Dissolve(this.duration, this.easing).setSrc(this.src);
    }
}


