import {Background, CommonImage} from "@core/types";
import {DeepPartial} from "@lib/util/data";
import type {
    AnimationPlaybackControls,
    AnimationScope,
    AnimationSequence,
    DOMKeyframesDefinition,
    DynamicAnimationOptions,
    ElementOrSelector,
    MotionValue,
    ValueAnimationTransition
} from "framer-motion";

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

    export type GenericKeyframesTarget<V> = [null, ...V[]] | V[];
    export type FramerAnimationScope<T> = AnimationScope<T>;
    export type FramerAnimate = {
        <V>(from: V, to: V | GenericKeyframesTarget<V>, options?: ValueAnimationTransition<V> | undefined): AnimationPlaybackControls;
        <V_1>(value: MotionValue<V_1>, keyframes: V_1 | GenericKeyframesTarget<V_1>, options?: ValueAnimationTransition<V_1> | undefined): AnimationPlaybackControls;
        (value: ElementOrSelector, keyframes: DOMKeyframesDefinition, options?: DynamicAnimationOptions | undefined): AnimationPlaybackControls;
        (sequence: AnimationSequence, options?: SequenceOptions | undefined): AnimationPlaybackControls;
    }

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
    export type SceneBackgroundTransformProps = {
        background: Background["background"];
        backgroundOpacity: number;
    };
    export type ImageTransformProps = CommonImage & {
        display: boolean;
        position: CommonImage["position"];
    };
    export type Types = ImageTransformProps | SceneBackgroundTransformProps;
    export type SequenceProps<T> = DeepPartial<T>;
    export type SequenceOptions = Partial<CommonTransformProps>;
    export type Sequence<T> = {
        props: SequenceProps<T>,
        options: SequenceOptions
    }
}