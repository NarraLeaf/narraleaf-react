import {Color, CommonDisplayableConfig} from "@core/types";
import {EventDispatcher, Serializer} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {Transform, TransformState} from "@core/elements/transform/transform";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {DisplayableActionContentType, DisplayableActionTypes, TextActionContentType} from "@core/action/actionTypes";
import {TextAction} from "@core/action/actions/textAction";
import {Scene} from "@core/elements/scene";
import {Control} from "@core/elements/control";
import {Displayable, DisplayableEventTypes} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {ConfigConstructor} from "@lib/util/config";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";
import {FontSize} from "@core/elements/transition/transitions/text/fontSize";

export type TextConfig = {
    alignX: "left" | "center" | "right";
    alignY: "top" | "center" | "bottom";
    className?: string;
};
export type TextState = {
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
     * The color of the text, supports {@link Color} and hex string
     * @default "#000000"
     */
    fontColor: Color;
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
} & DisplayableEventTypes<TextTransition>;

export class Text
    extends Displayable<TextDataRaw, Text, TransformDefinitions.TextTransformProps, TextTransition>
    implements EventfulDisplayable<TextTransition> {
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
                const transition: TextTransition = new FontSize(fontSize, duration, easing) as TextTransition;
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
    _init(scene?: Scene): DisplayableAction<typeof DisplayableActionTypes.init, Text> {
        return new DisplayableAction<typeof DisplayableActionTypes.init, Text>(
            this.chain(),
            DisplayableActionTypes.init,
            new ContentNode<DisplayableActionContentType["displayable:init"]>().setContent([scene])
        );
    }

    /**@internal */
    private _applyTransition(chain: Proxied<Text, Chained<LogicAction.Actions>>, transition: TextTransition): DisplayableAction<typeof DisplayableActionTypes.applyTransition, Text> {
        return new DisplayableAction<typeof DisplayableActionTypes.applyTransition, Text, TextTransition>(
            chain,
            DisplayableActionTypes.applyTransition,
            new ContentNode<DisplayableActionContentType<TextTransition>["displayable:applyTransition"]>().setContent([
                transition,
                (transition: TextTransition) => transition._setElement(this),
            ])
        );
    }
}


