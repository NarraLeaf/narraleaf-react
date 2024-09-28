import {IPosition, RawPosition} from "@core/elements/transform/position";

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
}

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

export type CommonImagePosition = "left" | "center" | "right";
export type CommonImage = {
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