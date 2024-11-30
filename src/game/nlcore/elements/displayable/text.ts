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
import {ITextTransition} from "@core/elements/transition/type";
import {Control} from "@core/elements/control";
import {FontSizeTransition} from "@core/elements/transition/textTransitions/fontSizeTransition";
import {Displayable, DisplayableEventTypes} from "@core/elements/displayable/displayable";

export type TextConfig = {
    alignX: "left" | "center" | "right";
    alignY: "top" | "center" | "bottom";
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
} & DisplayableEventTypes;

export class Text
    extends Actionable<TextDataRaw, Text>
    implements EventfulDisplayable {
    /**@internal */
    static EventTypes: { [K in keyof TextEventTypes]: K } = {
        ...Displayable.EventTypes,
        "event:text.show": "event:text.show",
        "event:text.hide": "event:text.hide",
    };
    /**@internal */
    static defaultConfig: TextConfig = {
        position: new CommonPosition(CommonPosition.Positions.Center),
        scale: 1,
        rotation: 0,
        opacity: 0,
        alignX: "center",
        alignY: "center",
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

    /**
     * Apply a transform to the Text
     * @chainable
     */
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
     * Apply a transition to the Text
     * @chainable
     */
    public applyTransition(transition: ITextTransition): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const action = this._applyTransition(chain, transition);
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

    /**@internal */
    private _applyTransition(chain: Proxied<Text, Chained<LogicAction.Actions, Text>>, transition: ITextTransition): TextAction<typeof TextAction.ActionTypes.applyTransition> {
        return new TextAction<typeof TextAction.ActionTypes.applyTransition>(
            chain,
            TextAction.ActionTypes.applyTransition,
            new ContentNode<TextActionContentType["text:applyTransition"]>().setContent([transition])
        );
    }
}


