import {color, CommonDisplayable} from "@core/types";

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
    export type ImageTransformProps = CommonDisplayable & {
        display: boolean;
    };
    export type TextTransformProps = ImageTransformProps & {
        fontColor: color;
    };
    export type Types = ImageTransformProps | TextTransformProps;
    export type SequenceProps<T> = Partial<T>;
    export type SequenceOptions = Partial<CommonTransformProps>;
    export type Sequence<T> = {
        props: SequenceProps<T>,
        options: SequenceOptions
    }
}