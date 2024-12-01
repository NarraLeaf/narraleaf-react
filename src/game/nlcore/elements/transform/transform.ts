import type {Background, color, CommonDisplayable, CommonImagePosition,} from "@core/types";
import {ImagePosition,} from "@core/types";
import type {AnimationPlaybackControls, DOMKeyframesDefinition, DynamicAnimationOptions} from "framer-motion";
import {deepMerge, DeepPartial, sleep, toHex} from "@lib/util/data";
import {GameState} from "@player/gameState";
import {TransformDefinitions} from "./type";
import {Align, CommonPosition, Coord2D, IPosition, PositionUtils, RawPosition} from "./position";
import {CSSProps} from "@core/elements/transition/type";
import {Utils} from "@core/common/Utils";
import {animate} from "framer-motion/dom";
import React from "react";
import {ImageConfig} from "@core/elements/displayable/image";
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
export type TransformersMap = {
    "position": CommonDisplayable["position"],
    "opacity": number,
    "scale": number,
    "rotation": number,
    "display": string,
    "src": string,
    "backgroundColor": Background["background"],
    "backgroundOpacity": number,
    "transform": TransformDefinitions.Types,
    "fontColor": color;
}

const CommonImagePositionMap = {
    [ImagePosition.left]: "25.33%",
    [ImagePosition.center]: "50%",
    [ImagePosition.right]: "75.66%"
} as const;

export class Transform<T extends TransformDefinitions.Types = object> {
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
     * Go to the left side of the stage
     */
    public static left(
        duration: number,
        easing: TransformDefinitions.EasingDefinition
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
        easing: TransformDefinitions.EasingDefinition
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
        easing: TransformDefinitions.EasingDefinition
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
    public static backgroundToCSS(background: Background["background"]): {
        backgroundImage?: string,
        backgroundColor?: string
    } {
        if (background === null || background === undefined) return {};
        if (Utils.isStaticImageData(background)) {
            return {backgroundImage: `url(${background.src})`};
        }
        if (typeof background === "string") {
            return {backgroundColor: background};
        }
        if (["r", "g", "b"].every(key => key in background)) {
            return {backgroundColor: toHex(background as color)};
        }
        const url = (background as { url: string }).url;
        return {backgroundImage: "url(" + url + ")"};
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

        const {invertY, invertX} = state.getLastScene()?.config || {};
        const Transforms = [
            `translate(${translate[0] || ((invertX ? "" : "-") + "50%")}, ${translate[1] || ((invertY ? "" : "-") + "50%")})`,
            (prop["rotation"] !== undefined) && `rotate(${prop["rotation"]}deg)`,
            `scale(${propScale * scale})`,
        ];
        return Transforms.filter(Boolean).join(" ");
    }

    /**@internal */
    private readonly sequenceOptions: TransformDefinitions.CommonSequenceProps;
    /**@internal */
    private sequences: TransformDefinitions.Sequence<T>[] = [];
    /**@internal */
    private control: AnimationPlaybackControls | null = null;
    /**@internal */
    private transformers: { [K in Transformers]?: TransformHandler<any> } = {};

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
     * @example
     * ```ts
     * const [scope, animate] = useAnimation();
     * transform.animate(scope, animate);
     * return <div ref={scope} />
     * ```
     */
    public async animate(
        {scope, overwrites, target}: {
            scope: React.MutableRefObject<HTMLDivElement | null>;
            overwrites?: Partial<{ [K in keyof TransformersMap]?: TransformHandler<TransformersMap[K]> }>;
            target: { state: CommonDisplayable }
        },
        gameState: GameState,
        after?: (state: DeepPartial<T>) => void
    ) {

        return new Promise<void>((resolve) => {
            (async () => {
                if (!this.sequenceOptions.sync) {
                    resolve();
                }
                for (let i = 0; i < this.sequenceOptions.repeat; i++) {
                    for (const {props, options} of this.sequences) {
                        const initState = deepMerge({}, this.propToCSS(gameState, target.state as any));

                        if (!scope.current) {
                            throw new Error("No scope found when animating.");
                        }
                        const current = scope.current as any;
                        Object.assign(current["style"], initState);

                        target.state = Transform.mergeState(target.state, props) as ImageConfig;

                        // Initiate animation
                        const animation = animate(
                            current,
                            this.propToCSS(gameState, target.state as any, overwrites),
                            this.optionsToFramerMotionOptions(options) || {}
                        );
                        this.setControl(animation);

                        gameState.logger.debug("Animating", this.propToCSS(gameState, target.state as any, overwrites));

                        // Wait for animation to finish
                        if (options?.sync === false) {
                            animation.then(() => {
                                Object.assign(current["style"], this.propToCSS(gameState, target.state as any, overwrites));
                                this.setControl(null);
                            });
                        } else {
                            await new Promise<void>(r => animation.then(() => r()));
                            Object.assign(current["style"], this.propToCSS(gameState, target.state as any, overwrites));
                            this.setControl(null);
                        }
                    }
                }

                await sleep(2);
                this.setControl(null);

                resolve();
                if (after) {
                    after(target.state as any);
                }
            })();
        });
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

    /**
     * overwrite a transformer
     *
     * **we don't recommend using this method**
     * @example
     * ```ts
     * transform.overwrite("position", (value) => {
     *   return {left: value.x, top: value.y};
     * });
     * ```
     */
    public overwrite<T extends keyof TransformersMap = any>(key: T, transformer: TransformHandler<TransformersMap[T]>) {
        this.transformers[key] = transformer;
        return this;
    }

    /**@internal */
    propToCSS(state: GameState, prop: DeepPartial<T>, overwrites?: Partial<{ [K in Transformers]?: TransformHandler<any> }>): DOMKeyframesDefinition {
        const {invertY, invertX} = state.getLastScene()?.config || {};
        const FieldHandlers: Omit<{ [K in keyof TransformersMap]: (value: TransformersMap[K]) => CSSProps }, "transform"> = {
            "position": (value: RawPosition | IPosition | undefined) => Transform.positionToCSS(value, invertY, invertX),
            "backgroundColor": (value: Background["background"]) => Transform.backgroundToCSS(value),
            "backgroundOpacity": (value: number) => ({opacity: value}),
            "opacity": (value: number) => ({opacity: value}),
            "scale": () => ({}),
            "rotation": () => ({}),
            "display": () => ({}),
            "src": () => ({}),
            "fontColor": (value: color) => {
                if (typeof value === "string") {
                    return {color: value};
                }
                return {color: toHex(value)};
            },
        };

        const props = {} as DOMKeyframesDefinition;
        props.transform = Transform.propToCSSTransform(state, prop);
        if (this.transformers["transform"]) {
            Object.assign(props, this.transformers["transform"](prop));
        }
        if (overwrites && overwrites["transform"]) {
            Object.assign(props, overwrites["transform"](prop));
        }

        // @todo: refactor this
        for (const key in prop) {
            if (!Object.prototype.hasOwnProperty.call(prop, key)) continue;
            if (overwrites && overwrites[key as keyof TransformersMap]) {
                Object.assign(props, overwrites[key as keyof TransformersMap]!(prop[key]));
            } else if (this.transformers[key as keyof TransformersMap]) {
                Object.assign(props, this.transformers[key as keyof TransformersMap]!(prop[key]));
            } else if (FieldHandlers[key as keyof Omit<TransformersMap, "transform">]) {
                Object.assign(props, (FieldHandlers[key as keyof Omit<TransformersMap, "transform">] as any)!(prop[key]));
            }
        }
        return props;
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

    /**@internal */
    setControl(control: AnimationPlaybackControls | null) {
        this.control = control;
        return this;
    }

    /**@internal */
    getControl() {
        return this.control;
    }

    public copy(): Transform<T> {
        return new Transform<T>(this.sequences, this.sequenceOptions);
    }
}




