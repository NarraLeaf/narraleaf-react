import {EventDispatcher} from "@lib/util/data";
import {ElementProp, EventTypes, ITransition, TransitionEventTypes} from "./type";
import {animate} from "framer-motion/dom";
import type {AnimationPlaybackControls, ValueAnimationTransition} from "framer-motion";


export class Base<T extends ElementProp> implements ITransition<T> {
    public controller: AnimationPlaybackControls | null | undefined;

    public events: EventDispatcher<EventTypes<[T[]]>> = new EventDispatcher();

    public start(_onComplete?: () => void): void {
    }

    public toElementProps(): T[] {
        return [] as T[];
    }

    setSrc(_src: string) {}

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
                this.events.emit(TransitionEventTypes.end, null);
                if (onComplete) {
                    onComplete();
                }
                this.controller = undefined;
            },
            ...options,
        });
        return this.controller;
    }

    copy(): ITransition<T> {
        return new Base<T>();
    }
}


