import type {EventDispatcher, EventToken} from "@lib/util/data";
import React from "react";
import type {AnimationPlaybackControls, DOMKeyframesDefinition} from "motion/react";
import {TransformDefinitions} from "@core/elements/transform/type";

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

/**@deprecated */
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

/**@internal */
export type EventTypes<T extends any[]> = {
    "start": [null];
    "update": T;
    "end": [null];
};

export enum TransitionAnimationType {
    Number,
    HexColor,
}

export type AnimationTypeToData<T extends TransitionAnimationType> =
    T extends TransitionAnimationType.Number ? number :
        T extends TransitionAnimationType.HexColor ? string :
            never;
export type AnimationTaskMapArray<T extends TransitionAnimationType[]> = {
    [K in keyof T]: {
        type: T[K];
        start: AnimationTypeToData<T[K]>;
        end: AnimationTypeToData<T[K]>;
        duration: number;
        ease?: TransformDefinitions.EasingDefinition;
    };
};
export type AnimationDataTypeArray<T extends TransitionAnimationType[]> = {
    [K in keyof T]: AnimationTypeToData<T[K]>;
};
export type TransitionResolver<T extends HTMLElement, U extends TransitionAnimationType[]> =
    ((...args: AnimationDataTypeArray<U>) => ElementProp<T>) | {
    resolver: ((...args: AnimationDataTypeArray<U>) => ElementProp<T>);
    key: "target" | "current";
};
export type TransitionTask<T extends HTMLElement, U extends TransitionAnimationType[] = never[]> = {
    animations: AnimationTaskMapArray<U>;
    resolve: TransitionResolver<T, U>[];
};

export type AnimationController<T extends TransitionAnimationType[]> = {
    onUpdate: (handler: (values: AnimationDataTypeArray<T>) => void) => EventToken;
    onComplete: (handler: () => void) => EventToken;
    complete: () => void;
    start: () => void;
    cancel: () => void;
};

