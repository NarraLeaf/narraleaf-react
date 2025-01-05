import type {EventDispatcher} from "@lib/util/data";
import React from "react";
import type {AnimationPlaybackControls, DOMKeyframesDefinition} from "motion/react";
import {Color, ImageSrc} from "@core/types";

/**@internal */
export type ElementProp<T extends Element = Element, U extends React.HTMLAttributes<T> = React.HTMLAttributes<T>> =
    T extends HTMLImageElement
        ? React.JSX.IntrinsicAttributes
        & React.ClassAttributes<T>
        & React.ImgHTMLAttributes<T>
        & U
        : T extends HTMLAnchorElement
            ? React.JSX.IntrinsicAttributes
            & React.ClassAttributes<T>
            & React.AnchorHTMLAttributes<T>
            & U
            : T extends HTMLButtonElement
                ? React.JSX.IntrinsicAttributes
                & React.ClassAttributes<T>
                & React.ButtonHTMLAttributes<T>
                & U
                : React.JSX.IntrinsicAttributes
                & React.ClassAttributes<T>
                & React.HTMLAttributes<T>
                & U;
/**@internal */
export type ImgElementProp = ElementProp<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>;
/**@internal */
export type SpanElementProp = ElementProp<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>;
/**@internal */
export type DivElementProp = ElementProp<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>;
/**@internal */
export type CSSElementProp<T extends React.CSSProperties | DOMKeyframesDefinition> = ElementProp & { style: T };
/**@internal */
export type CSSProps = React.CSSProperties;
/**@internal */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type EmptyObject = {};

export interface ITransition<T extends ElementProp = Record<string, any>> {
    /**@internal */
    events: EventDispatcher<EventTypes<[T[]]>>;

    /**@internal */
    controller: AnimationPlaybackControls | null | undefined;

    start(onComplete?: () => void): void;

    toElementProps(): T[];

    copy(): ITransition<T>;

    complete(): void;
}

export interface IImageTransition<T extends ElementProp = ImgElementProp> extends ITransition<T> {
    setSrc(src: ImageSrc | Color): void;

    copy(): IImageTransition<T>;
}

export interface ITextTransition<T extends ElementProp = SpanElementProp> extends ITransition<T> {
    copy(): ITextTransition<T>;
}

/**@internal */
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


