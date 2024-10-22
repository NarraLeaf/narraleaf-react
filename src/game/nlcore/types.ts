import {IPosition, RawPosition} from "@core/elements/transform/position";
import {ITransition} from "@core/elements/transition/type";
import {Transform} from "@core/elements/transform/transform";
import {EventDispatcher} from "@lib/util/data";
import React from "react";

export type color = string | {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export type RGBColor = {
    r: number;
    g: number;
    b: number;
}

export type RGBAColor = RGBColor & {
    a: number;
}

export type Color = {
    color: color;
};

export type Font = {
    italic?: boolean;
    bold?: boolean;
    fontFamily?: React.CSSProperties["fontFamily"];
    fontSize?: React.CSSProperties["fontSize"];
};

export type CommonText = {
    text: string;
} & Color;

export type NextJSStaticImageData = StaticImageData;

export interface StaticImageData {
    src: string;
    height: number;
    width: number;
    blurDataURL?: string;
    blurWidth?: number;
    blurHeight?: number;
}

export type Background = {
    background: {
        url: string;
    } | color | null | undefined | StaticImageData;
}
export type ImageSrc = string | StaticImageData;
export type HexColor = `#${string}`;
export type ImageColor = color | HexColor;

export type CommonImagePosition = "left" | "center" | "right";
export type CommonDisplayable = {
    scale?: number;
    rotation?: number;
    position?: RawPosition | IPosition;
    opacity?: number;
    alt?: string;
}

export const ImagePosition: {
    [K in CommonImagePosition]: K;
} = {
    center: "center",
    left: "left",
    right: "right"
} as const;

export type DisplayableAnimationEvents =
    | "event:displayable.applyTransform"
    | "event:displayable.applyTransition"
    | "event:displayable.init";
export type EventfulDisplayableEvents = {
    [K in DisplayableAnimationEvents]:
    K extends "event:displayable.applyTransform" ? [Transform] :
        K extends "event:displayable.applyTransition" ? [ITransition] :
            K extends "event:displayable.init" ? [] :
                never;
}

export interface EventfulDisplayable {
    events: EventDispatcher<EventfulDisplayableEvents>;

    toDisplayableTransform(): Transform;
}