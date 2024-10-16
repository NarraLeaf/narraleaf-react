import {ElementProp, ITransition} from "./type";
import {Base} from "./base";
import {ImageColor, ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";
import {toHex} from "@lib/util/data";


export type DissolveElementProps = {
    opacity: number;
}

type DissolveProps = {
    style: {
        opacity: number;
        backgroundColor?: string;
    },
    src?: string;
};

/**
 * @class Dissolve
 * @implements ITransition
 * @extends Base
 * @description Dissolve transition effect
 */
export class Dissolve extends Base<DissolveProps> implements ITransition<DissolveProps> {
    static Frames: [number, number] = [1, 0];
    private readonly duration: number;
    private state: DissolveElementProps = {
        opacity: 0,
    };
    private src?: ImageSrc | ImageColor;

    /**
     * Image will dissolve from one image to another
     */
    constructor(duration: number = 1000, src?: ImageSrc | ImageColor) {
        super();
        this.duration = duration;
        if (src) {
            this.src = src;
        }
    }

    setSrc(src: ImageSrc | ImageColor) {
        this.src = src;
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
            }
        });
    }

    public toElementProps(): (DissolveProps & ElementProp)[] {
        return [
            {
                style: {opacity: this.state.opacity},
            },
            {
                style: {
                    opacity: 1 - this.state.opacity,
                    backgroundColor: Utils.isImageColor(this.src) ? toHex(this.src) : "",
                },
                src: Utils.isImageSrc(this.src) ? Utils.srcToString(this.src) : "",
            },
        ];
    }

    copy(): ITransition<DissolveProps> {
        return new Dissolve(this.duration, this.src);
    }
}


