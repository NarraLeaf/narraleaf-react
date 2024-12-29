import {color, CommonDisplayableConfig} from "@core/types";
import {EventDispatcher, Serializer} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {Transform, TransformState} from "@core/elements/transform/transform";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {TextActionContentType} from "@core/action/actionTypes";
import {TextAction} from "@core/action/actions/textAction";
import {Scene} from "@core/elements/scene";
import {ITextTransition} from "@core/elements/transition/type";
import {Control} from "@core/elements/control";
import {FontSizeTransition} from "@core/elements/transition/textTransitions/fontSizeTransition";
import {Displayable, DisplayableEventTypes} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {ConfigConstructor} from "@lib/util/config";

export type TextConfig = {
    alignX: "left" | "center" | "right";
    alignY: "top" | "center" | "bottom";
    className?: string;
};
type TextState = {
    fontSize: number;
    display: boolean;
    text: string;
};

export interface ITextUserConfig extends CommonDisplayableConfig {
    /**
     * Where to align the text horizontally
     * @default "center"
     */
    alignX: "left" | "center" | "right";
    /**
     * Where to align the text vertically
     * @default "center"
     */
    alignY: "top" | "center" | "bottom";
    className?: string;
    /**
     * The font size of the text, see [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-size)
     *
     * **Only supports px unit**
     * @default 16
     */
    fontSize: number;
    /**
     * The color of the text, supports {@link color} and hex string
     * @default "#000000"
     */
    fontColor: color;
    /**
     * The text content
     */
    text: string;
}

/**@internal */
export type TextDataRaw = {
    state: Record<string, any>;
    transformState: Record<string, any>;
};
/**@internal */
export type TextEventTypes = {
    "event:text.show": [Transform];
    "event:text.hide": [Transform];
} & DisplayableEventTypes;

export class Text
    extends Displayable<TextDataRaw, Text>
    implements EventfulDisplayable {
    /**@internal */
    static EventTypes: { [K in keyof TextEventTypes]: K } = {
        ...Displayable.EventTypes,
        "event:text.show": "event:text.show",
        "event:text.hide": "event:text.hide",
    };

    /**@internal */
    static DefaultUserConfig = new ConfigConstructor<ITextUserConfig>({
        alignX: "center",
        alignY: "center",
        className: "",
        fontSize: 16,
        fontColor: "#000000",
        text: "",
    });

    /**@internal */
    static DefaultTextConfig = new ConfigConstructor<TextConfig>({
        alignX: "center",
        alignY: "center",
        className: "",
    });

    /**@internal */
    static DefaultTextState = new ConfigConstructor<TextState>({
        fontSize: 16,
        display: false,
        text: "",
    });

    /**@internal */
    static DefaultTextTransformState = new ConfigConstructor<TransformDefinitions.TextTransformProps>({
        fontColor: "#000000",
    });

    /**@internal */
    static StateSerializer = new Serializer<TextState>();

    /**@internal */
    readonly config: Readonly<TextConfig>;
    /**@internal */
    public transformState: TransformState<TransformDefinitions.TextTransformProps>;
    /**@internal */
    public state: TextState;
    /**@internal */
    readonly events: EventDispatcher<TextEventTypes> = new EventDispatcher();

    constructor(config: Partial<TextConfig>);
    constructor(text: string, config?: Partial<TextConfig>);
    constructor(arg0: Partial<TextConfig> | string, arg1: Partial<TextConfig> = {}) {
        super();
        const config = typeof arg0 === "string" ? {
            ...arg1,
            text: arg0,
        } : arg0;
        const userConfig = Text.DefaultUserConfig.create(config);
        const textConfig = Text.DefaultTextConfig.create(userConfig.get());
        const [transformState] = userConfig.extract(Text.DefaultTextTransformState.keys());

        this.config = textConfig.get();
        this.state = Text.DefaultTextState.create().assign({
            text: userConfig.get().text,
        }).get();
        this.transformState =
            new TransformState<TransformDefinitions.TextTransformProps>(transformState.get());
    }

    /**
     * Apply a transform to the Text
     * @chainable
     */
    public transform(transform: Transform<TransformDefinitions.TextTransformProps>): Proxied<Text, Chained<LogicAction.Actions>> {
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
     * if options are provided, the text will show with the provided transform options
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
     * if options are provided, the text will hide with the provided transform options
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

    /**
     * Set the text of the Text
     * @chainable
     */
    public setText(text: string): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const action = new TextAction<typeof TextAction.ActionTypes.setText>(
            chain,
            TextAction.ActionTypes.setText,
            new ContentNode<TextActionContentType["text:setText"]>().setContent([text])
        );
        return chain.chain(action);
    }

    /**
     * Set the font color of the Text
     * @chainable
     */
    public setFontSize(fontSize: number, duration: number = 0, easing?: TransformDefinitions.EasingDefinition): Proxied<Text, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            if (duration) {
                const transition = new FontSizeTransition(this.state.fontSize, fontSize, duration, easing);
                chain.chain(this._applyTransition(chain, transition));
            }
            const action = new TextAction<typeof TextAction.ActionTypes.setFontSize>(
                chain,
                TextAction.ActionTypes.setFontSize,
                new ContentNode<TextActionContentType["text:setFontSize"]>().setContent([fontSize])
            );
            return chain.chain(action);
        });
    }

    /**@internal */
    toData(): TextDataRaw {
        return {
            state: Text.StateSerializer.serialize(this.state),
            transformState: this.transformState.serialize(),
        };
    }

    /**@internal */
    fromData(data: TextDataRaw): this {
        this.state = Text.StateSerializer.deserialize(data.state);
        this.transformState =
            TransformState.deserialize<TransformDefinitions.TextTransformProps>(data.transformState);
        return this;
    }

    /**@internal */
    _init(scene?: Scene): TextAction<typeof TextAction.ActionTypes.init> {
        return new TextAction<typeof TextAction.ActionTypes.init>(
            this.chain(),
            TextAction.ActionTypes.init,
            new ContentNode<TextActionContentType["text:init"]>().setContent([scene])
        );
    }

    /**@internal */
    private _applyTransition(chain: Proxied<Text, Chained<LogicAction.Actions, Text>>, transition: ITextTransition): TextAction<typeof TextAction.ActionTypes.applyTransition> {
        return new TextAction<typeof TextAction.ActionTypes.applyTransition>(
            chain,
            TextAction.ActionTypes.applyTransition,
            new ContentNode<TextActionContentType["text:applyTransition"]>().setContent([transition])
        );
    }
}


