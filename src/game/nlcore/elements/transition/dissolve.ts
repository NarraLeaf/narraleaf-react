import {ElementProp, ITransition} from "./type";
import {Base} from "./base";
import {Scene} from "@core/elements/scene";
import {NextJSStaticImageData} from "@core/types";
import {Utils} from "@core/common/Utils";


export type DissolveElementProps = {
    opacity: number;
}

type DissolveProps = {
    style: {
        opacity: number;
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
    private src: string | undefined;

    /**
     * Image will dissolve from one image to another
     */
    constructor(duration: number = 1000, src?: string | NextJSStaticImageData | Scene) {
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
        this.state.opacity = Dissolve.Frames[0];

        this.requestAnimation({
            start: Dissolve.Frames[0],
            end: Dissolve.Frames[1],
            duration: this.duration
        }, {
            onComplete,
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
                style: {opacity: 1 - this.state.opacity},
                src: this.src,
            }
        ];
    }

    copy(): ITransition<DissolveProps> {
        return new Dissolve(this.duration, this.src);
    }
}


