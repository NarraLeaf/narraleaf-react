import {ElementProp, ITransition} from "./type";
import {Base} from "./base";
import {ImageColor, ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";
import {toHex} from "@lib/util/data";


export type FadeElementProps = {
    opacity: number;
}

type FadeProps = {
    style?: {
        opacity: number;
        backgroundColor?: string;
    },
    src?: string;
}

export class Fade extends Base<FadeProps> implements ITransition {
    static Frames: [number, number] = [0, 1];
    private readonly duration: number;
    private state: FadeElementProps = {
        opacity: 1,
    };
    private src?: ImageSrc | ImageColor;

    /**
     * The current image will fade out, and the next image will fade in
     */
    constructor(duration: number = 1000, src?: ImageSrc | ImageColor) {
        super();
        this.duration = duration;
        if (src) {
            this.src = src;
        }
    }

    setSrc(src: string) {
        this.src = src;
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
        });
    }

    public toElementProps(): (FadeProps & ElementProp)[] {
        return [
            {
                style: {
                    opacity: 1,
                },
            },
            {
                style: {
                    opacity: this.state.opacity,
                    backgroundColor: Utils.isImageColor(this.src) ? toHex(this.src) : "",
                },
                src: Utils.isImageSrc(this.src) ? Utils.srcToString(this.src) : "",
            },
        ];
    }

    copy(): ITransition<FadeProps> {
        return new Fade(this.duration, this.src);
    }
}


