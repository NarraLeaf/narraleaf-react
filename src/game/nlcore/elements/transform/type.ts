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
    /**
     * The camera's lens channels.
     *
     * These describe things a *lens* does, not things the picture does, which is why they are not
     * part of {@link VisualEffectTransformProps} and never reach an element's own style: they are
     * drawn by an overlay pinned to the viewport, outside the camera's transform, so a vignette
     * stays put while the camera it belongs to zooms, pans and rotates underneath it.
     */
    export type CameraLensProps = {
        /**
         * How far the shutter is closed, between `0` (open) and `1` (shut).
         *
         * Two blades close symmetrically from the top and bottom of the frame, so at `1` each
         * covers half of it. Small values are a letterbox rather than a blink: `0.12` is a
         * cinematic matte.
         * @default 0
         */
        shutter?: number;
        /**
         * Colour of the shutter blades.
         * @default "#000"
         */
        shutterColor?: string;
        /**
         * Strength of the vignette, between `0` (none) and `1` (opaque at the edges).
         * @default 0
         */
        vignette?: number;
        /**
         * Colour of the vignette.
         * @default "#000"
         */
        vignetteColor?: string;
        /**
         * Radius at which the vignette starts, as a CSS length or percentage of the frame.
         * @default "44%"
         */
        vignetteInner?: string;
        /**
         * Radius at which the vignette reaches full strength.
         * @default "78%"
         */
        vignetteOuter?: string;
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
    /**
     * What a camera can be transformed by: everything an image can, plus the lens channels.
     */
    export type CameraTransformProps = ImageTransformProps & CameraLensProps;
    /**
     * The closed set of keys a {@link Transform} can stage a change for. Every prop any displayable
     * understands has to appear here, camera-only ones included, or the chainable setters cannot
     * name it.
     */
    export type Types = CommonDisplayableConfig & ImageTransformProps & TextTransformProps & CameraLensProps;
    export type SequenceProps<T> = Partial<T>;
    export type SequenceOptions = Partial<CommonTransformProps>;
    export type Sequence<T> = {
        props: SequenceProps<T>,
        options: SequenceOptions
    };
    export type SequenceAtDefinition = number | `+${number}` | `-${number}`;
}
