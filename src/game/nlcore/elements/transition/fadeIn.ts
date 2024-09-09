import {ElementProp, ITransition, TransitionEventTypes} from "@core/elements/transition/type";
import {Base} from "@core/elements/transition/base";
import {animate} from "framer-motion";
import {Scene} from "@core/elements/scene";
import {StaticImageData} from "@core/types";
import {Utils} from "@core/common/Utils";
import {getCallStack} from "@lib/util/data";

type FadeInElementProps = {
    opacity: number;
    transform: string;
}

type FadeInProps = {
    style?: {
        opacity: number;
        transform: string;
    },
    src?: string;
}

export class FadeIn extends Base<FadeInProps> implements ITransition {
    __stack: string;
    private readonly duration: number;
    private readonly direction: 'left' | 'right' | 'top' | 'bottom';
    private readonly offset: number;
    private state: FadeInElementProps = {
        opacity: 0,
        transform: ''
    };
    private src: string;

    constructor(direction: 'left' | 'right' | 'top' | 'bottom', offset: number, duration: number = 1000, src?: Scene | StaticImageData | string) {
        super();
        this.duration = duration;
        this.direction = direction;
        this.offset = offset;
        if (src) {
            this.src = typeof src === "string" ? src :
                src instanceof Scene ? Utils.backgroundToSrc(src.config.background) :
                    Utils.staticImageDataToSrc(src);
        }
        this.__stack = getCallStack();
    }

    setSrc(src: string) {
        this.src = src;
    }

    public start(onComplete?: () => void): void {
        if (!this.src) {
            throw new Error('src is required, but not provided\nat:\n' + this.__stack);
        }

        this.state.opacity = 0;
        this.state.transform = this.getInitialTransform();
        this.events.emit(TransitionEventTypes.start, null);

        animate(0, 1, {
            duration: this.duration / 1000,
            onUpdate: (value) => {
                this.state.opacity = value;
                this.state.transform = this.getTransform(value);
                this.events.emit(TransitionEventTypes.update, this.toElementProps());
            },
            onComplete: () => {
                this.events.emit(TransitionEventTypes.end, null);
                if (onComplete) {
                    onComplete();
                }
            },
        });
    }

    public toElementProps(): (FadeInProps & ElementProp)[] {
        return [
            {},
            {
                style: {
                    opacity: this.state.opacity,
                    transform: this.state.transform,
                },
                src: this.src,
            }
        ];
    }

    copy(): ITransition<FadeInProps> {
        return new FadeIn(this.direction, this.offset, this.duration, this.src);
    }

    private getInitialTransform(): string {
        switch (this.direction) {
            case 'left':
                return `translateX(-${this.offset}px)`;
            case 'right':
                return `translateX(${this.offset}px)`;
            case 'top':
                return `translateY(-${this.offset}px)`;
            case 'bottom':
                return `translateY(${this.offset}px)`;
            default:
                return '';
        }
    }

    private getTransform(progress: number): string {
        switch (this.direction) {
            case 'left':
                return `translateX(${(1 - progress) * -this.offset}px)`;
            case 'right':
                return `translateX(${(1 - progress) * this.offset}px)`;
            case 'top':
                return `translateY(${(1 - progress) * -this.offset}px)`;
            case 'bottom':
                return `translateY(${(1 - progress) * this.offset}px)`;
            default:
                return '';
        }
    }
}