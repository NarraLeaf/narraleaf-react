import type {EventDispatcher} from "@lib/util/data";
import React from "react";
import type {AnimationPlaybackControls, DOMKeyframesDefinition} from "framer-motion";
import {ImageColor, ImageSrc} from "@core/types";

export type ElementProp<T extends Element = Element, U extends React.HTMLAttributes<T> = React.HTMLAttributes<T>> =
    React.JSX.IntrinsicAttributes
    & React.ClassAttributes<T>
    & React.HTMLAttributes<T>
    & U;
export type ImgElementProp = ElementProp<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>;
export type SpanElementProp = ElementProp<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>;
export type CSSElementProp<T extends React.CSSProperties | DOMKeyframesDefinition> = ElementProp & { style: T };
export type CSSProps = React.CSSProperties;

export interface ITransition<T extends ElementProp = Record<string, any>> {
    events: EventDispatcher<EventTypes<[T[]]>>;

    controller: AnimationPlaybackControls | null | undefined;

    start(onComplete?: () => void): void;

    toElementProps(): T[];

    copy(): ITransition<T>;
}

export interface IImageTransition<T extends ElementProp = ImgElementProp> extends ITransition<T> {
    setSrc(src: ImageSrc | ImageColor): void;

    copy(): IImageTransition<T>;
}

export interface ITextTransition<T extends ElementProp = SpanElementProp> extends ITransition<T> {
    copy(): ITextTransition<T>;
}

export type EventTypes<T extends any[]> = {
    "start": [null];
    "update": T;
    "end": [null];
};

export const TransitionEventTypes: {
    [K in keyof EventTypes<any>]: K;
} = {
    "start": "start",
    "update": "update",
    "end": "end",
};


