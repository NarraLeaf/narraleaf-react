import {Color, CommonDisplayableConfig} from "@core/types";

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
    } & {
        sync: boolean;
    };
    export type TransformConfig = {
        sync: boolean;
    }
    export type CommonSequenceProps = {
        sync: boolean;
        repeat: number;
    }
    export type ImageTransformProps = CommonDisplayableConfig & {};
    export type TextTransformProps = CommonDisplayableConfig & {
        fontColor?: Color;
    };
    export type Types = CommonDisplayableConfig & ImageTransformProps & TextTransformProps;
    export type SequenceProps<T> = Partial<T>;
    export type SequenceOptions = Partial<CommonTransformProps>;
    export type Sequence<T> = {
        props: SequenceProps<T>,
        options: SequenceOptions
    }
}