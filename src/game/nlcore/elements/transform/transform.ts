import type {CommonDisplayableConfig, CommonImagePosition,} from "@core/types";
import {ImagePosition,} from "@core/types";
import type {AnimationPlaybackControls, DOMKeyframesDefinition, DynamicAnimationOptions} from "motion/react";
import {animate} from "motion/react";
import {Awaitable, deepMerge, DeepPartial, Serializer, SkipController, toHex} from "@lib/util/data";
import {GameState} from "@player/gameState";
import {TransformDefinitions} from "./type";
import {
    Align,
    CommonPosition,
    CommonPositionType,
    Coord2D,
    D2Position,
    IPosition,
    PositionUtils,
    RawPosition
} from "./position";
import {CSSProps} from "@core/elements/transition/type";
import React from "react";
import {ConfigConstructor} from "@lib/util/config";
import Sequence = TransformDefinitions.Sequence;
import SequenceProps = TransformDefinitions.SequenceProps;

export type Transformers =
    "position"
    | "opacity"
    | "scale"
    | "rotation"
    | "display"
    | "src"
    | "backgroundColor"
    | "backgroundOpacity"
    | "transform"
    | "fontColor";
export type TransformHandler<T> = (value: T) => DOMKeyframesDefinition;
/**@internal */
export type TransformStateProps = TransformDefinitions.Types;

const CommonImagePositionMap = {
    [ImagePosition.left]: "25.33%",
    [ImagePosition.center]: "50%",
    [ImagePosition.right]: "75.66%"
} as const;

type OverwriteMap = {
    transform: React.CSSProperties["transform"];
    scale: React.CSSProperties["scale"];
    overwrite: CSSProps;
};
export type OverwriteDefinition = {
    [K in keyof OverwriteMap]?: OverwriteHandler<OverwriteMap[K]>;
};
type OverwriteHandler<T> = (value: Partial<TransformDefinitions.Types>) => T;

/**@internal */
export class TransformState<T extends TransformDefinitions.Types> {
    static DefaultTransformState = new ConfigConstructor<CommonDisplayableConfig>({
        scale: 1,
        rotation: 0,
        position: new CommonPosition(CommonPositionType.Center),
        opacity: 0,
        alt: "",
    });

    static TransformStateSerializer = new Serializer<
        TransformDefinitions.Types,
        {
            position: (pos: IPosition | RawPosition) => D2Position;
        }
    >({
        position: (pos) => PositionUtils.toCoord2D(PositionUtils.tryParsePosition(pos)!),
    }, {
        position: PositionUtils.toCoord2D,
    });

    static deserialize<T extends TransformDefinitions.Types>(data: Record<string, any>): TransformState<T> {
        return new TransformState<T>(TransformState.TransformStateSerializer.deserialize(data) as Partial<T>);
    }

    static mergePosition(
        a: RawPosition | IPosition | undefined,
        b: RawPosition | IPosition | undefined
    ): Coord2D {
        if (!a && !b) {
            throw new Error("No position found.");
        }
        if (!a || !b) {
            return PositionUtils.toCoord2D(PositionUtils.tryParsePosition(a || b)!);
        }
        return PositionUtils.mergePosition(
            PositionUtils.tryParsePosition(a),
            PositionUtils.tryParsePosition(b)
        );
    }

    static mergeState<T extends TransformStateProps>(a: Partial<T>, b: Partial<T>): Partial<T> {
        if ("position" in a && "position" in b) {
            const position = this.mergePosition(a.position, b.position);
            return {
                ...Object.assign({}, a, b),
                position,
            };
        }
        return {
            ...Object.assign({}, a, b),
        };
    }

    private locked: symbol | null = null;

    constructor(public state: Partial<T> = {}) {
    }

    public get(): Partial<T> {
        return this.state;
    }

    public assign(key: symbol, state: Partial<T>) {
        if (!this.canWrite(key)) {
            throw new Error("Trying to write a locked transform state.");
        }
        this.state = TransformState.mergeState<T>(this.state, state);
        return this;
    }

    public lock(): symbol {
        this.locked = Symbol();
        return this.locked;
    }

    public isLocked(): boolean {
        return !!this.locked;
    }

    public canWrite(key: symbol): boolean {
        return this.locked === null || this.locked === key;
    }

    public unlock(key: symbol) {
        if (this.locked === key) {
            this.locked = null;
        }
        return this;
    }

    public toStyle(gameState: GameState, overwrites?: OverwriteDefinition): CSSProps {
        return Transform.constructStyle(gameState, this.state, overwrites);
    }

    public serialize(): Record<string, any> {
        return TransformState.TransformStateSerializer.serialize(this.state);
    }
}

export class Transform<T extends TransformDefinitions.Types = any> {
    /**@internal */
    static defaultSequenceOptions: Partial<TransformDefinitions.CommonSequenceProps> = {
        sync: true,
        repeat: 1,
    };
    /**@internal */
    static defaultOptions: TransformDefinitions.SequenceProps<any> = {
        duration: 0,
        ease: "linear",
    };
    /**@internal */
    static CommonImagePositionMap = CommonImagePositionMap;

    /**@internal */
    public static isPosition(position: any): position is (CommonImagePosition | Coord2D | Align) {
        return CommonPosition.isCommonPositionType(position) || Coord2D.isCoord2DPosition(position) || Align.isAlignPosition(position);
    }

    /**
     * Apply transform immediately
     */
    public static immediate<T extends TransformDefinitions.Types>(
        props: SequenceProps<T>,
    ): Transform<T> {
        return new Transform<T>(props, {
            duration: 0,
            ease: "linear",
        });
    }

    /**
     * Go to the left side of the stage
     */
    public static left(
        duration: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Transform<TransformDefinitions.ImageTransformProps> {
        return new Transform<TransformDefinitions.ImageTransformProps>({
            position: CommonPosition.Positions.Left
        }, {duration, ease: easing});
    }

    /**
     * Go to the right side of the stage
     */
    public static right(
        duration: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Transform<TransformDefinitions.ImageTransformProps> {
        return new Transform<TransformDefinitions.ImageTransformProps>({
            position: CommonPosition.Positions.Right
        }, {duration, ease: easing});
    }

    /**
     * Go to the center of the stage
     */
    public static center(
        duration: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Transform<TransformDefinitions.ImageTransformProps> {
        return new Transform<TransformDefinitions.ImageTransformProps>({
            position: CommonPosition.Positions.Center
        }, {duration, ease: easing});
    }

    /**@internal */
    public static positionToCSS(
        position: RawPosition | IPosition | undefined,
        invertY?: boolean | undefined,
        invertX?: boolean | undefined
    ): CSSProps {
        if (!position) {
            return {};
        }
        if (PositionUtils.isRawPosition(position)) {
            return PositionUtils.D2PositionToCSS(
                PositionUtils.rawPositionToCoord2D(position),
                invertX,
                invertY
            );
        }
        return PositionUtils.D2PositionToCSS(position.toCSS(), invertX, invertY);
    }

    /**@internal */
    static mergePosition(a: RawPosition | undefined, b: RawPosition | undefined): Coord2D {
        if (!a && !b) {
            throw new Error("No position found.");
        }
        if (!a || !b) {
            return PositionUtils.toCoord2D(PositionUtils.tryParsePosition(a || b)!);
        }
        return PositionUtils.mergePosition(
            PositionUtils.tryParsePosition(a),
            PositionUtils.tryParsePosition(b)
        );
    }

    /**@internal */
    static mergeState<T>(state: any, props: any): DeepPartial<T> {
        const position = this.mergePosition(state["position"], props["position"]);
        return {
            ...deepMerge(state, props),
            position,
        };
    }

    /**@internal */
    static propToCSSTransform(
        state: GameState,
        prop: Record<string, any>,
        {
            translate = [],
            scale = 1,
        }: {
            translate?: [string?, string?];
            scale?: number;
        } = {}): string {
        if (!state.getLastScene()) {
            throw new Error("No scene found in state, make sure you called \"scene.activate()\" before this method.");
        }

        const propScale = (prop["scale"] !== undefined) ? prop["scale"] : 1;

        const {invertY, invertX} = state.getStory().getInversionConfig();
        const Transforms = [
            `translate(${translate[0] || ((invertX ? "" : "-") + "50%")}, ${translate[1] || ((invertY ? "" : "-") + "50%")})`,
            (prop["rotation"] !== undefined) && `rotate(${prop["rotation"]}deg)`,
            `scale(${propScale * scale})`,
        ];
        return Transforms.filter(Boolean).join(" ");
    }

    /**@internal */
    static constructStyle<T extends TransformDefinitions.Types>(state: GameState, props: Partial<T>, overwrites?: OverwriteDefinition): CSSProps {
        const {invertY, invertX} = state.getStory().getInversionConfig();
        const {transform, scale, overwrite} = overwrites || {};
        return {
            ...Transform.positionToCSS(props.position, invertY, invertX),
            opacity: props.opacity,
            color: "fontColor" in props ? toHex((props as TransformDefinitions.TextTransformProps).fontColor) : undefined,
            transform: transform ? transform(props) : undefined,
            scale: scale ? scale(props) : undefined,
            ...(overwrite ? overwrite(props) : {}),
        } satisfies CSSProps;
    }

    /**@internal */
    private readonly sequenceOptions: TransformDefinitions.CommonSequenceProps;
    /**@internal */
    private sequences: TransformDefinitions.Sequence<T>[] = [];

    /**
     * @example
     * ```ts
     * const transform = new Transform<ImageTransformProps>({
     *   opacity: 1,
     *   position: "center"
     * }, {
     *   duration: 0,
     *   ease: "linear"
     * });
     * ```
     */
    constructor(sequences: Sequence<T>[], transformConfig?: Partial<TransformDefinitions.TransformConfig>);

    constructor(props: SequenceProps<T>, options?: Partial<TransformDefinitions.CommonTransformProps>);

    constructor(arg0: Sequence<T>[] | SequenceProps<T>, arg1?: Partial<TransformDefinitions.TransformConfig> | Partial<TransformDefinitions.CommonTransformProps>) {
        if (Array.isArray(arg0)) {
            this.sequences.push(...arg0);
            this.sequenceOptions =
                Object.assign({}, Transform.defaultSequenceOptions, arg1 || {}) as TransformDefinitions.CommonSequenceProps;
        } else {
            const [props, options] =
                [(arg0 as SequenceProps<T>), (arg1 || Transform.defaultOptions as Partial<TransformDefinitions.CommonTransformProps>)];
            this.sequences.push({props, options: options || {}});
            this.sequenceOptions =
                Object.assign({}, Transform.defaultSequenceOptions) as TransformDefinitions.CommonSequenceProps;
        }
    }

    /**
     * @internal
     */
    public animate(
        transformState: TransformState<T>,
        {
            gameState,
            ref,
            overwrites,
        }: {
            gameState: GameState,
            ref: React.RefObject<HTMLDivElement | null>,
            overwrites?: OverwriteDefinition,
        },
    ): Awaitable<void> {
        const controllers: AnimationPlaybackControls[] = [];
        const lock = transformState.lock();
        const sequences: TransformDefinitions.Sequence<T>[] = this.constructSequence();
        const assignStyle = (style: CSSProps) => {
            if (!ref.current) {
                throw new Error("No ref found when animating.");
            }
            Object.assign(ref.current.style, style);
        };
        const skip = () => {
            controllers.forEach(c => c.complete());
            while (sequences.length) {
                const {props} = sequences.shift()!;
                transformState.assign(lock, props);
            }
            assignStyle(Transform.constructStyle(gameState, transformState.state, overwrites));
            transformState.unlock(lock);
        };
        const awaitable = new Awaitable<void>()
            .registerSkipController(new SkipController(skip));

        this.runAsync(async () => {
            for (let i = 0; i < this.sequenceOptions.repeat; i++) {
                for (const {props, options} of sequences) {
                    if (!transformState.canWrite(lock)) {
                        return;
                    }

                    if (!ref.current) {
                        throw new Error("No ref found when animating.");
                    }

                    const style = Transform.constructStyle(gameState, props, overwrites);
                    const control = animate(
                        ref.current,
                        style as DOMKeyframesDefinition,
                        this.optionsToFramerMotionOptions(options) || {}
                    );
                    const complete = () => {
                        controllers.splice(controllers.indexOf(control), 1);
                        transformState.assign(lock, props);
                    };
                    controllers.push(control);

                    if (options?.sync === false) {
                        control.then(complete);
                    } else {
                        await new Promise<void>(r => control.then(() => r()));
                        complete();
                    }
                }
            }
        });

        return awaitable;
    }

    /**@internal */
    public isSync(): boolean {
        return this.sequenceOptions.sync;
    }

    /**
     * @example
     * ```ts
     * transform
     *   .repeat(2)
     *   .repeat(3)
     * // repeat 6 times
     * ```
     */
    public repeat(n: number) {
        this.sequenceOptions.repeat *= n;
        return this;
    }

    /**@internal */
    optionsToFramerMotionOptions(options?: Partial<TransformDefinitions.CommonTransformProps>): DynamicAnimationOptions | void {
        if (!options) {
            return options;
        }
        const {duration, ease} = options;
        return {
            duration: duration ? (duration / 1000) : 0,
            ease,
        } satisfies DynamicAnimationOptions;
    }

    public copy(): Transform<T> {
        return new Transform<T>(this.sequences, this.sequenceOptions);
    }

    /**@internal */
    private constructSequence(): TransformDefinitions.Sequence<T>[] {
        return this.sequences.map(({props, options}) => ({props, options}));
    }

    /**@internal */
    private runAsync(fn: () => any): void {
        return void (async function () {
            return void fn();
        })();
    }
}




