import React from "react";
import type { CommonDisplayableConfig, CommonImagePosition } from "@core/types";
import { ImagePosition } from "@core/types";
import { animate } from "motion/react";
import type {
    At,
    DOMKeyframesDefinition,
    DOMSegmentWithTransition,
    AnimationOptions,
    SequenceOptions
} from "motion";
import { Awaitable, deepMerge, DeepPartial, onlyValidFields, Serializer, SkipController, StringKeyOf, toHex } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { TransformDefinitions } from "./type";
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
import { CSSProps } from "@core/elements/transition/type";
import { ConfigConstructor } from "@lib/util/config";
import { RuntimeScriptError } from "@core/common/Utils";

/**@internal */
export type TransformStateProps = TransformDefinitions.Types;

type Change<K extends StringKeyOf<TransformDefinitions.Types>> = {
    key: K;
    props: TransformDefinitions.Types[K];
};

const CommonImagePositionMap = {
    [ImagePosition.left]: "25.33%",
    [ImagePosition.center]: "50%",
    [ImagePosition.right]: "75.66%"
} as const;

type OverwriteMap = {
    overwrite: CSSProps;
};
export type OverwriteDefinition = {
    [K in keyof OverwriteMap]?: OverwriteHandler<OverwriteMap[K]>;
};
type OverwriteHandler<T> = (value: Partial<TransformDefinitions.Types>) => T;

/**@internal */
export class TransformState<T extends TransformDefinitions.Types> {
    static DefaultTransformState = new ConfigConstructor<CommonDisplayableConfig>({
        scaleX: 1,
        scaleY: 1,
        zoom: 1,
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
        position: (pos) => PositionUtils.serializePosition(PositionUtils.tryParsePosition(pos)!),
    }, {
        position: (pos) => PositionUtils.toCoord2D(pos),
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

    public state: Partial<T> = {};
    private locked: symbol | null = null;
    private frozen: boolean = false;

    constructor(state: Partial<T> = {}) {
        this.state = state;
    }

    public get(): Partial<T> {
        return this.state;
    }

    public freeze(): this {
        this.frozen = true;
        return this;
    }

    public assign(key: symbol, state: Partial<T>): this {
        if (this.frozen) {
            throw new Error("Trying to write a frozen transform state.");
        }
        if (!this.canWrite(key)) {
            throw new Error("Trying to write a locked transform state.");
        }
        this.state = TransformState.mergeState<T>(this.state, state);
        return this;
    }

    public lock(): symbol {
        if (this.locked) {
            throw new Error("Transform state is already locked.");
        }
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

    public toFramesDefinition(gameState: GameState, overwrites?: OverwriteDefinition): DOMKeyframesDefinition {
        return onlyValidFields(Transform.constructStyle(gameState, this.state, overwrites));
    }

    public toStyle(gameState: GameState, overwrites?: OverwriteDefinition): CSSProps {
        return onlyValidFields(Transform.constructStyle(gameState, this.state, overwrites)) as CSSProps;
    }

    public serialize(): Record<string, any> {
        return TransformState.TransformStateSerializer.serialize(this.state);
    }

    public clone(): TransformState<T> {
        return new TransformState<T>(TransformState.mergeState<T>({}, this.state));
    }

    public overwrite(key: symbol, state: Partial<T>): this {
        if (this.frozen) {
            throw new Error("Trying to write a frozen transform state.");
        }
        if (!this.canWrite(key)) {
            throw new Error("Trying to write a locked transform state.");
        }
        this.state = TransformState.mergeState<T>(this.state, state);
        return this;
    }

    public forceOverwrite(state: Partial<T>): this {
        this.state = state;
        return this;
    }
}

export class Transform<T extends TransformDefinitions.Types = CommonDisplayableConfig> {
    /**@internal */
    static defaultConfig: TransformDefinitions.TransformConfig = {
        sync: true,
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
        props: TransformDefinitions.SequenceProps<T>,
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
        }, { duration, ease: easing });
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
        }, { duration, ease: easing });
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
        }, { duration, ease: easing });
    }

    /**
     * Create a new transform with the given config. The sequences will be empty.
     * @param config - The config for the transform.
     * @returns A new transform with the given config.
     */
    public static create<T extends TransformDefinitions.Types = CommonDisplayableConfig>(config?: Partial<TransformDefinitions.TransformConfig>): Transform<T> {
        return new Transform<T>([], config);
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
        prop: Partial<TransformDefinitions.Types>,
        {
            translate = [],
            scale = 1,
        }: {
            translate?: [string?, string?];
            scale?: number;
        } = {}): string {
        const propScale = (prop["scale"] !== undefined) ? prop["scale"] : 1;

        const { invertY, invertX } = state.getStory().getInversionConfig();
        const Transforms = [
            `translate(${translate[0] || ((invertX ? "" : "-") + "50%")}, ${translate[1] || ((invertY ? "" : "-") + "50%")})`,
            (prop["rotation"] !== undefined) && `rotate(${prop["rotation"]}deg)`,
            `scale(${propScale * scale})`,
        ];
        return Transforms.filter(Boolean).join(" ");
    }

    /**@internal */
    static constructStyle<T extends TransformDefinitions.Types>(state: GameState, props: Partial<T>, overwrites?: OverwriteDefinition): DOMKeyframesDefinition {
        const { invertY, invertX } = state.getStory().getInversionConfig();
        const { overwrite } = overwrites || {};
        return {
            ...Transform.positionToCSS(props.position, invertY, invertX),
            opacity: props.opacity,
            color: ("fontColor" in props && props.fontColor) ? toHex((props as TransformDefinitions.TextTransformProps).fontColor!) : undefined,
            transform: Transform.propToCSSTransform(state, props),
            scale: props.scale,
            ...(overwrite ? overwrite(props) : {}),
        } satisfies DOMKeyframesDefinition;
    }

    /**@internal */
    private readonly config: TransformDefinitions.TransformConfig;
    /**@internal */
    private sequences: TransformDefinitions.Sequence<T>[] = [];
    /**@internal */
    private stagedChanges: Change<StringKeyOf<TransformDefinitions.Types>>[] = [];

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
    constructor(sequences: TransformDefinitions.Sequence<T>[], transformConfig?: Partial<TransformDefinitions.TransformConfig>);

    constructor(props: TransformDefinitions.SequenceProps<T>, options?: Partial<TransformDefinitions.CommonTransformProps>);

    constructor(arg0: TransformDefinitions.Sequence<T>[] | TransformDefinitions.SequenceProps<T>, arg1?: Partial<TransformDefinitions.TransformConfig> | Partial<TransformDefinitions.CommonTransformProps>) {
        if (Array.isArray(arg0)) {
            this.sequences.push(...arg0);
            this.config =
                Object.assign({}, Transform.defaultConfig, arg1 || {}) as TransformDefinitions.TransformConfig;
        } else {
            const [props, options] =
                [(arg0 as TransformDefinitions.SequenceProps<T>), (arg1 || Transform.defaultOptions as Partial<TransformDefinitions.CommonTransformProps>)];
            this.sequences.push({ props, options: options || Transform.defaultOptions });
            this.config =
                Object.assign({}, Transform.defaultConfig) as TransformDefinitions.TransformConfig;
        }
    }

    /**@internal*/
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
        if (!ref.current) {
            throw new Error("No ref found when animating.");
        }
        this.commit();

        const {
            finalState,
            sequences,
            options,
        } = this.constructAnimation({
            gameState,
            transformState,
            overwrites,
            current: ref.current,
        });
        if (!sequences.length) {
            gameState.logger.warn("Transform", "No sequences to animate.");
        }

        let completed = false;

        const lock = transformState.lock();
        const token = animate(sequences, options);
        const skip = () => {
            transformState
                .overwrite(lock, finalState.get())
                .unlock(lock);
            token.complete();
            completed = true;
        };
        const awaitable = new Awaitable<void>()
            .registerSkipController(new SkipController(skip));
        const onComplete = () => {
            if (!completed) {
                transformState
                    .overwrite(lock, finalState.get())
                    .unlock(lock);
            }
            completed = true;

            gameState.logger.debug("Transform", "Transform Completed", transformState.toStyle(gameState, overwrites));
            awaitable.resolve();
        };

        token.then(onComplete, ((arg0: unknown) => {
            gameState.logger.error("Failed to animate transform. " + (arg0?.toString?.() || ""));
        }) as any);
        token.play();

        gameState.logger.debug("Transform", "Ready to animate transform.", {
            finalState,
            sequences,
            options,
        }, this);

        return awaitable;
    }

    /**
     * Create a new transform that repeats {@link n} x current repeat count times.
     * @example
     * ```ts
     * transform
     *   .repeat(2)
     *   .repeat(3)
     * // repeat 6 times
     * ```
     */
    public repeat(n: number): Transform<T> {
        const newTransform = this.copy();
        if (!newTransform.config.repeat) {
            newTransform.config.repeat = 1;
        }
        newTransform.config.repeat *= n;
        return newTransform;
    }

    /**@internal */
    public getOptions(options?: Partial<TransformDefinitions.CommonTransformProps>): AnimationOptions & At {
        if (!options) {
            return { ...Transform.defaultOptions };
        }
        const { duration, ease, delay, at } = options;
        return {
            duration: this.toSeconds(duration, undefined),
            ease,
            delay: this.toSeconds(delay, undefined),
            at: this.atToSeconds(at),
        } satisfies AnimationOptions & At;
    }

    /**
     * @internal
     * **CAUTION**: don't lock this transformState before calling this method.
     */
    public constructAnimation(
        {
            gameState,
            transformState,
            overwrites = {},
            current,
        }: {
            gameState: GameState;
            transformState: TransformState<any>;
            overwrites?: OverwriteDefinition;
            current: Element;
        }
    ): {
        finalState: TransformState<any>;
        sequences: DOMSegmentWithTransition[];
        options: SequenceOptions;
    } {
        const state = transformState.clone();
        const lock = state.lock();
        const sequences = this.sequences.map(({ props, options }) => {
            const segDefinition = state.assign(lock, props).toFramesDefinition(
                gameState,
                overwrites
            );
            return [
                current,
                segDefinition,
                this.getOptions(options),
            ] satisfies DOMSegmentWithTransition;
        }) satisfies DOMSegmentWithTransition[];
        return {
            finalState: state.unlock(lock).freeze(),
            sequences: sequences,
            options: this.getSequenceOptions(),
        };
    }

    /**@internal */
    public getSequenceOptions(): SequenceOptions {
        const { repeat, repeatDelay } = this.config;
        return {
            repeat,
            repeatDelay: this.toSeconds(repeatDelay, undefined),
        };
    }

    /**
     * Copy the current transform.
     * @returns {Transform<T>} A new transform with the same sequences and config.
     */
    public copy(): Transform<T> {
        return new Transform<T>(this.sequences, this.config);
    }

    /**
     * Commits all staged changes to the transform sequence.
     * This method will create a new sequence from all pending changes that have been staged via chained methods.
     * If there are no staged changes, this method will return the current instance without modification.
     * After committing, the staged changes array will be cleared.
     * @returns {this} The current Transform i  nstance for method chaining
     * @example
     * ```ts
     * transform
     *   .position({ x: 100, y: 100 })
     *   .opacity(1).commit() // will create a new sequence with opacity 1 and position x: 100, y: 100
     *   .position({ x: 200, y: 200 })
     *   .opacity(0).commit({ duration: 1000 }) // will create a new sequence with opacity 0 and position x: 200, y: 200 with a duration of 1 second
     * ```
     * 
     * **Note**: The staged changes will be committed before animation starts to ensure the latest changes are applied.
     */
    public commit(options?: Partial<TransformDefinitions.SequenceOptions>): this {
        if (!this.stagedChanges.length) {
            return this;
        }

        const sequence = this.constructCommit(this.stagedChanges, this.getSequenceOptions());
        this.sequences.push({
            props: sequence.props as Partial<T>,
            options: {
                ...this.getSequenceOptions(),
                ...options,
            },
        } satisfies TransformDefinitions.Sequence<T>);
        this.stagedChanges = [];

        return this;
    }

    /**
     * Scale the current staging sequence.
     * @param {number} scale - The scale of the transform.
     * @returns {this} The current Transform instance for method chaining.
     */
    public scale(scale: TransformDefinitions.Types["scale"]): this {
        return this.pushChange({
            key: "scale",
            props: scale,
        });
    }

    /**
     * Rotate the current staging sequence.
     * @param {number} rotation - The rotation of the transform.
     * @returns {this} The current Transform instance for method chaining.
     */
    public rotation(rotation: TransformDefinitions.Types["rotation"]): this {
        return this.pushChange({
            key: "rotation",
            props: rotation,
        });
    }

    /**
     * Set the position of the current staging sequence.
     * @param {number} position - The position of the transform.
     * @returns {this} The current Transform instance for method chaining.
     */
    public position(position: TransformDefinitions.Types["position"]): this {
        return this.pushChange({
            key: "position",
            props: position,
        });
    }

    /**
     * Set the opacity of the current staging sequence.
     * @param {number} opacity - The opacity of the transform.
     * @returns {this} The current Transform instance for method chaining.
     */
    public opacity(opacity: TransformDefinitions.Types["opacity"]): this {
        return this.pushChange({
            key: "opacity",
            props: opacity,
        });
    }

    /**
     * Set the font color of the current staging sequence.
     * @param {string} fontColor - The font color of the transform.
     * @returns {this} The current Transform instance for method chaining.
     */
    public fontColor(fontColor: TransformDefinitions.Types["fontColor"]): this {
        return this.pushChange({
            key: "fontColor",
            props: fontColor,
        });
    }

    /**@internal */
    private constructCommit(stagedChanges: Change<StringKeyOf<TransformDefinitions.Types>>[], options: TransformDefinitions.SequenceOptions): TransformDefinitions.Sequence<TransformDefinitions.Types> {
        const sequence: TransformDefinitions.Sequence<TransformDefinitions.Types> = {
            props: {},
            options,
        };
        for (const change of stagedChanges) {
            sequence.props[change.key] = change.props as any;
        }
        return sequence;
    }

    /**@internal */
    pushChange<K extends StringKeyOf<TransformDefinitions.Types>>(change: Change<K>): this {
        this.stagedChanges.push(change);
        return this;
    }

    /**@internal */
    public toSeconds<T>(ms: number | undefined, defaultValue: T): number | T {
        if (typeof ms === "undefined") {
            return defaultValue;
        }
        return ms / 1000;
    }

    /**@internal */
    public atToSeconds(atDefinition: TransformDefinitions.SequenceAtDefinition | undefined): TransformDefinitions.SequenceAtDefinition | undefined {
        if (typeof atDefinition === "undefined") {
            return atDefinition;
        }
        if (typeof atDefinition === "number") {
            return atDefinition / 1000;
        }

        /**
         * Regex:
         * - `([+-])`: match a sign of `+` or `-`.
         * - `(\d+)`: match a number.
         * Matches:
         * - `+n`: positive number.
         * - `-n`: negative number.
         */
        const regex = /^([+-])(\d+)$/;
        const match = regex.exec(atDefinition);

        if (!match) {
            throw new RuntimeScriptError("Invalid at definition. At definition must be a number or a string in the format of `+n` or `-n`.");
        }

        const [_$0, sign, numStr] = match;
        const num = Number(numStr);

        if (isNaN(num)) {
            throw new RuntimeScriptError("Invalid number in at definition.");
        }

        const result = num / 1000;
        return sign === "+" ? `+${result}` : `-${result}`;
    }
}




