import {ElementProp, ITransition} from "./type";
import {Base} from "./base";
import {Scene} from "@core/elements/scene";
import {StaticImageData} from "@core/types";
import {Utils} from "@core/common/Utils";


export type FadeElementProps = {
    opacity: number;
}

type FadeProps = {
    style?: {
        opacity: number;
    },
    src?: string;
}

export class Fade extends Base<FadeProps> implements ITransition {
    static Frames: [number, number] = [0, 1];
    private readonly duration: number;
    private state: FadeElementProps = {
        opacity: 1,
    };
    private src: string | undefined;

    /**
     * The current image will fade out, and the next image will fade in
     */
    constructor(duration: number = 1000, src?: Scene | StaticImageData | string) {
        super();
        this.duration = duration;
        if (src) {
            this.src = typeof src === "string" ? src :
                src instanceof Scene ? Utils.backgroundToSrc(src.config.background) :
                    Utils.staticImageDataToSrc(src);
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
                },
                src: this.src,
            },
        ];
    }

    copy(): ITransition<FadeProps> {
        return new Fade(this.duration, this.src);
    }
}


