import {Color, CommonDisplayableConfig} from "@core/types";
import type React from "react";

export namespace TransformDefinitions {
    export type BezierDefinition = [number, number, number, number];
    export type CustomEasingFunction = (t: number) => number;
    export type EasingDefinition =
        CustomEasingFunction
        | BezierDefinition
        | "linear"
        | "easeIn"
        | "easeOut"
        | "easeInOut"
        | "circIn"
        | "circOut"
        | "circInOut"
        | "backIn"
        | "backOut"
        | "backInOut"
        | "anticipate";

    export type CommonTransformProps = {
        duration: number;
        ease: EasingDefinition;
        delay: number;
        at: TransformDefinitions.SequenceAtDefinition;
    } & {
        /**@deprecated */
        sync?: boolean;
    };
    export type TransformConfig = {
        sync: boolean;
        repeat?: number;
        repeatDelay?: number;
    };
    export type VisualEffectTransformProps = {
        maskImage?: React.CSSProperties["maskImage"];
        maskSize?: React.CSSProperties["maskSize"];
        maskPosition?: React.CSSProperties["maskPosition"];
        maskRepeat?: React.CSSProperties["maskRepeat"];
        maskMode?: React.CSSProperties["maskMode"];
        clipPath?: React.CSSProperties["clipPath"];
        filter?: React.CSSProperties["filter"];
        backdropFilter?: React.CSSProperties["backdropFilter"];
        mixBlendMode?: React.CSSProperties["mixBlendMode"];
    };
    export type VisualEffectOptions = Partial<CommonTransformProps>;
    export type MaskOptions = VisualEffectOptions & Pick<
        VisualEffectTransformProps,
        "maskSize" | "maskPosition" | "maskRepeat" | "maskMode"
    >;
    export type WipeDirection = "left" | "right" | "top" | "bottom";
    export type CircleClipOptions = VisualEffectOptions & {
        center?: string;
        from?: number;
        to?: number;
        clearClip?: boolean;
    };
    export type CircleRevealOptions = CircleClipOptions;
    export type CircleCloseOptions = CircleClipOptions;
    export type WipeOptions = VisualEffectOptions & {
        direction?: WipeDirection;
        reverse?: boolean;
        clearClip?: boolean;
    };
    export type ImageTransformProps = CommonDisplayableConfig & VisualEffectTransformProps;
    export type TextTransformProps = CommonDisplayableConfig & {
        fontColor?: Color;
    } & VisualEffectTransformProps;
    export type Types = CommonDisplayableConfig & ImageTransformProps & TextTransformProps;
    export type SequenceProps<T> = Partial<T>;
    export type SequenceOptions = Partial<CommonTransformProps>;
    export type Sequence<T> = {
        props: SequenceProps<T>,
        options: SequenceOptions
    };
    export type SequenceAtDefinition = number | `+${number}` | `-${number}`;
}
