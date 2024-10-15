import {color, CommonDisplayable} from "@core/types";
import {Actionable} from "@core/action/actionable";
import {CommonPosition} from "@core/elements/transform/position";
import {deepMerge, EventDispatcher} from "@lib/util/data";
import {Image} from "./image";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {Transform} from "@core/elements/transform/transform";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ImageAction} from "@core/action/actions/imageAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {TextActionContentType} from "@core/action/actionTypes";
import {TextAction} from "@core/action/actions/textAction";
import {Scene} from "@core/elements/scene";

export type TextConfig = {
    align: "left" | "center" | "right";
    className?: string;
    fontSize: number;
    fontColor: color;
    display: boolean;
} & CommonDisplayable;

export type TextDataRaw = {
    state: Record<string, any>;
};

export type TextEventTypes = {
    "event:text.show": [Transform];
    "event:text.hide": [Transform];
    "event:text.applyTransform": [Transform];
    "event:text.init": [];
};

export class Text extends Actionable<TextDataRaw, Text> {
    static EventTypes: { [K in keyof TextEventTypes]: K } = {
        "event:text.show": "event:text.show",
        "event:text.hide": "event:text.hide",
        "event:text.applyTransform": "event:text.applyTransform",
        "event:text.init": "event:text.init",
    };
    static defaultConfig: TextConfig = {
        position: new CommonPosition(CommonPosition.Positions.Center),
        scale: 1,
        rotation: 0,
        opacity: 0,
        align: "center",
        fontSize: 16,
        fontColor: "#000000",
        display: false,
    };

    /**@internal */
    readonly config: TextConfig;
    /**@internal */
    state: TextConfig;
    /**@internal */
    readonly events: EventDispatcher<TextEventTypes> = new EventDispatcher();

    constructor(config: Partial<TextConfig> = {}) {
        super();
        this.config = deepMerge({}, Text.defaultConfig, config);
        this.state = deepMerge({}, this.config);
    }

    public applyTransform(transform: Transform): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const action = new TextAction<typeof TextAction.ActionTypes.applyTransform>(
            chain,
            ImageAction.ActionTypes.applyTransform,
            new ContentNode<TextActionContentType["text:applyTransform"]>().setContent([
                transform.copy(),
            ])
        );
        return chain.chain(action);
    }

    /**
     * Show the Text
     *
     * if options is provided, the text will show with the provided transform options
     * @example
     * ```ts
     * text.show({
     *     duration: 1000,
     * });
     * ```
     * @chainable
     */
    public show(): Proxied<Text, Chained<LogicAction.Actions>>;

    public show(options: Transform<TransformDefinitions.TextTransformProps>): Proxied<Text, Chained<LogicAction.Actions>>;

    public show(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>>;

    public show(options?: Transform<TransformDefinitions.TextTransformProps> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const trans =
            (options instanceof Transform) ? options.copy() : new Transform<TransformDefinitions.TextTransformProps>([
                {
                    props: {
                        opacity: 1,
                    },
                    options: options || {}
                }
            ]);
        const action = new TextAction<typeof TextAction.ActionTypes.show>(
            chain,
            ImageAction.ActionTypes.show,
            new ContentNode<TextActionContentType["text:show"]>().setContent([trans])
        );
        return chain.chain(action);
    }

    /**
     * Hide the Text
     *
     * if options is provided, the text will hide with the provided transform options
     * @example
     * ```ts
     * text.hide({
     *     duration: 1000,
     * });
     * ```
     * @chainable
     */
    public hide(): Proxied<Text, Chained<LogicAction.Actions>>;

    public hide(options: Transform<TransformDefinitions.TextTransformProps>): Proxied<Text, Chained<LogicAction.Actions>>;

    public hide(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>>;

    public hide(options?: Transform<TransformDefinitions.TextTransformProps> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const trans =
            (options instanceof Transform) ? options.copy() : new Transform<TransformDefinitions.ImageTransformProps>([
                {
                    props: {
                        opacity: 1,
                    },
                    options: options || {}
                }
            ]);
        const action = new TextAction<typeof TextAction.ActionTypes.hide>(
            chain,
            TextAction.ActionTypes.hide,
            new ContentNode<TextActionContentType["text:hide"]>().setContent([trans])
        );
        return chain.chain(action);
    }

    /**@internal */
    toData(): TextDataRaw {
        return {
            state: deepMerge({}, Image.serializeImageState(this.state))
        };
    }

    /**@internal */
    fromData(data: TextDataRaw): this {
        this.state = deepMerge({}, Image.deserializeImageState(data.state));
        return this;
    }

    /**@internal */
    toTransform(): Transform<TransformDefinitions.TextTransformProps> {
        return new Transform<TransformDefinitions.TextTransformProps>([
            {
                props: {
                    position: this.state.position,
                    scale: this.state.scale,
                    rotation: this.state.rotation,
                    opacity: this.state.opacity,
                    fontSize: this.state.fontSize,
                    fontColor: this.state.fontColor,
                    display: this.state.display,
                },
                options: {
                    sync: true,
                }
            }
        ]);
    }

    /**@internal */
    _init(scene?: Scene): TextAction<typeof TextAction.ActionTypes.init> {
        return new TextAction<typeof TextAction.ActionTypes.init>(
            this.chain(),
            TextAction.ActionTypes.init,
            new ContentNode<TextActionContentType["text:init"]>().setContent([scene])
        );
    }
}


