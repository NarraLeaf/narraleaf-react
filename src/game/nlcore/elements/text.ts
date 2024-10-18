import {color, CommonDisplayable, EventfulDisplayable} from "@core/types";
import {Actionable} from "@core/action/actionable";
import {CommonPosition} from "@core/elements/transform/position";
import {deepMerge, EventDispatcher} from "@lib/util/data";
import {Image} from "./image";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {Transform} from "@core/elements/transform/transform";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {TextActionContentType} from "@core/action/actionTypes";
import {TextAction} from "@core/action/actions/textAction";
import {Scene} from "@core/elements/scene";
import {ITransition} from "@core/elements/transition/type";

export type TextConfig = {
    align: "left" | "center" | "right";
    className?: string;
    fontSize: number;
    fontColor: color;
    display: boolean;
    text: string;
} & CommonDisplayable;

export type TextDataRaw = {
    state: Record<string, any>;
};

export type TextEventTypes = {
    "event:text.show": [Transform];
    "event:text.hide": [Transform];
    "event:displayable.applyTransition": [ITransition];
    "event:displayable.applyTransform": [Transform];
    "event:displayable.init": [];
};

export class Text
    extends Actionable<TextDataRaw, Text>
    implements EventfulDisplayable {
    static EventTypes: { [K in keyof TextEventTypes]: K } = {
        "event:text.show": "event:text.show",
        "event:text.hide": "event:text.hide",
        "event:displayable.applyTransition": "event:displayable.applyTransition",
        "event:displayable.applyTransform": "event:displayable.applyTransform",
        "event:displayable.init": "event:displayable.init",
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
        text: "",
    };

    /**@internal */
    readonly config: TextConfig;
    /**@internal */
    state: TextConfig;
    /**@internal */
    readonly events: EventDispatcher<TextEventTypes> = new EventDispatcher();

    constructor(config: Partial<TextConfig>);
    constructor(text: string, config?: Partial<TextConfig>);
    constructor(configOrText: Partial<TextConfig> | string, config: Partial<TextConfig> = {}) {
        super();
        if (typeof configOrText === "string") {
            this.config = deepMerge({}, Text.defaultConfig, config, {text: configOrText});
        } else {
            this.config = deepMerge({}, Text.defaultConfig, configOrText);
        }
        this.state = deepMerge({}, this.config);
    }

    public applyTransform(transform: Transform<TransformDefinitions.TextTransformProps>): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const action = new TextAction<typeof TextAction.ActionTypes.applyTransform>(
            chain,
            TextAction.ActionTypes.applyTransform,
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
            TextAction.ActionTypes.show,
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

    public setText(text: string): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const action = new TextAction<typeof TextAction.ActionTypes.setText>(
            chain,
            TextAction.ActionTypes.setText,
            new ContentNode<TextActionContentType["text:setText"]>().setContent([text])
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

    /**
     * @internal
     * @deprecated
     */
    toTransform(): Transform<TransformDefinitions.TextTransformProps> {
        return new Transform<TransformDefinitions.TextTransformProps>(this.state, {
            duration: 0,
        });
    }

    /**@internal */
    toDisplayableTransform(): Transform {
        return new Transform<TransformDefinitions.TextTransformProps>(this.state, {
            duration: 0,
        });
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


