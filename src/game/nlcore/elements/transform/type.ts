import {color, CommonDisplayable} from "@core/types";
import {DeepPartial} from "@lib/util/data";

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
        position: CommonDisplayable["position"];
    };
    export type TextTransformProps = ImageTransformProps & {
        fontColor: color;
    };
    export type Types = ImageTransformProps | TextTransformProps | object;
    export type SequenceProps<T> = DeepPartial<T>;
    export type SequenceOptions = Partial<CommonTransformProps>;
    export type Sequence<T> = {
        props: SequenceProps<T>,
        options: SequenceOptions
    }
}