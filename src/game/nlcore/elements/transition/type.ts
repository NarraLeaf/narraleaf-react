import type {EventDispatcher} from "@lib/util/data";
import React from "react";
import {DOMKeyframesDefinition} from "framer-motion";

export type ElementProp<T extends Element = Element, U extends React.HTMLAttributes<T> = React.HTMLAttributes<T>> =
    React.JSX.IntrinsicAttributes
    & React.ClassAttributes<T>
    & React.HTMLAttributes<T>
    & U;
export type ImgElementProp = ElementProp<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>;
export type CSSElementProp<T extends React.CSSProperties | DOMKeyframesDefinition> = ElementProp & { style: T };
export type CSSProps = React.CSSProperties;

export interface ITransition<T extends ElementProp = {}> {
    events: EventDispatcher<EventTypes<[T[]]>>;

    start(onComplete?: () => void): void;

    toElementProps(): T[];

    setSrc(src: string): void;

    copy(): ITransition<T>;
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


