import {EventDispatcher} from "@lib/util/data";
import {ElementProp, EventTypes, IImageTransition, ITransition, TransitionEventTypes} from "./type";
import {animate} from "framer-motion/dom";
import type {AnimationPlaybackControls, ValueAnimationTransition} from "framer-motion";
import {ImageColor, ImageSrc} from "@core/types";
import {TransformDefinitions} from "@core/common/types";


export class BaseTransition<T extends ElementProp> implements ITransition<T> {
    controller: AnimationPlaybackControls | null | undefined;

    events: EventDispatcher<EventTypes<[T[]]>> = new EventDispatcher();

    start(_onComplete?: () => void): void {
        throw new Error("Method not implemented.");
    }

    toElementProps(): T[] {
        throw new Error("Method not implemented.");
    }

    public copy(): ITransition<T> {
        throw new Error("Method not implemented.");
    }

    protected requestAnimation(
        {
            start, end, duration
        }: {
            start: number;
            end: number;
            duration: number;
        },
        {
            onComplete, onUpdate
        }: {
            onComplete?: () => void;
            onUpdate?: (value: number) => void;
        },
        options?: ValueAnimationTransition<number>
    ): AnimationPlaybackControls {
        this.events.emit(TransitionEventTypes.start, null);

        this.controller = animate(start, end, {
            duration: duration / 1000,
            onUpdate: (value) => {
                if (onUpdate) {
                    onUpdate(value);
                }
                this.events.emit(TransitionEventTypes.update, this.toElementProps());
            },
            onComplete: () => {
                this.controller = undefined;
                this.events.emit(TransitionEventTypes.end, null);
                if (onComplete) {
                    onComplete();
                }
            },
            ...options,
        });
        return this.controller;
    }
}

export class BaseImageTransition<T extends ElementProp>
    extends BaseTransition<T>
    implements IImageTransition<T> {
    static DefaultEasing: TransformDefinitions.EasingDefinition = "linear";

    public setSrc(_src?: ImageSrc | ImageColor): this {
        throw new Error("Method not implemented.");
    }

    public copy(): IImageTransition<T> {
        throw new Error("Method not implemented.");
    }
}

export class BaseTextTransition<T extends ElementProp>
    extends BaseTransition<T>
    implements ITransition<T> {
    public copy(): ITransition<T> {
        throw new Error("Method not implemented.");
    }
}

