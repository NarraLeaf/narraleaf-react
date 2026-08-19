import {Color} from "@core/types";
import {Serializer} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {Transform, TransformState} from "@core/elements/transform/transform";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {DisplayableActionContentType, DisplayableActionTypes, TextActionContentType} from "@core/action/actionTypes";
import {TextAction} from "@core/action/actions/textAction";
import {Scene} from "@core/elements/scene";
import {Control} from "@core/elements/control";
import {Displayable} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Config, ConfigConstructor, MergeConfig} from "@lib/util/config";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";
import {FontSize} from "@core/elements/transition/transitions/text/fontSize";
import {Layer} from "@core/elements/layer";
import {EmptyObject} from "@core/elements/transition/type";
import {IPosition, PositionUtils, RawPosition} from "@core/elements/transform/position";

export type TextConfig = {
    alignX: "left" | "center" | "right";
    alignY: "top" | "center" | "bottom";
    className?: string;
    layer: Layer | undefined;
};
export type TextState = {
    fontSize: number;
    display: boolean;
    text: string;
};

export interface ITextUserConfig extends TransformDefinitions.TextTransformProps {
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
    /**
     * Layer of the text
     */
    layer?: Layer;
}

export type TextDataRaw = {
    state: Record<string, any>;
    transformState: Record<string, any>;
};

export class Text
    extends Displayable<TextDataRaw, Text, TransformDefinitions.TextTransformProps>
    implements EventfulDisplayable {
    /**@internal */
    private static _defaultUserConfig: ConfigConstructor<ITextUserConfig, {
        position: IPosition;
    }> | null = null;

    /**
     * Built on first use rather than while this module is evaluating.
     *
     * The spread reads `TransformState` out of another module and `scene.ts` imports this one, an
     * edge that puts this initialiser inside the `transform/transform` cycle — where `TransformState`
     * is still `undefined` and the throw names neither module. Reading the defaults on demand settles
     * it rather than depending on where in the cycle this module lands.
     *
     * The transform defaults are part of this config because `ConfigConstructor.create` copies only
     * the keys its own defaults declare. `ITextUserConfig extends TextTransformProps`, so
     * `new Text("hi", {opacity: 0})` type-checks — and without them the 0 was dropped in silence.
     * `Image` has always spread them; this is the same shape, parser included, so a raw position
     * becomes an `IPosition` here too.
     *
     * @internal
     */
    static get DefaultUserConfig(): ConfigConstructor<ITextUserConfig, {
        position: IPosition;
    }> {
        return (Text._defaultUserConfig ??= new ConfigConstructor<ITextUserConfig, {
            position: IPosition;
        }>({
            alignX: "center",
            alignY: "center",
            className: "",
            fontSize: 16,
            fontColor: "#000000",
            text: "",
            ...TransformState.DefaultTransformState.getDefaultConfig(),
        }, {
            position: (value: RawPosition | IPosition | undefined) => {
                return PositionUtils.tryParsePosition(value);
            }
        }));
    }

    /**@internal */
    static DefaultTextConfig = new ConfigConstructor<TextConfig>({
        alignX: "center",
        alignY: "center",
        className: "",
        layer: undefined,
    });

    /**@internal */
    static DefaultTextState = new ConfigConstructor<TextState>({
        fontSize: 16,
        display: false,
        text: "",
    });

    /**@internal */
    private static _defaultTextTransformState: ConfigConstructor<TransformDefinitions.TextTransformProps> | null = null;

    /**
     * Built on first use, for the same reason as {@link Text.DefaultUserConfig}.
     *
     * @internal
     */
    static get DefaultTextTransformState(): ConfigConstructor<TransformDefinitions.TextTransformProps> {
        return (Text._defaultTextTransformState ??= new ConfigConstructor<TransformDefinitions.TextTransformProps>({
            fontColor: "#000000",
            ...TransformState.DefaultTransformState.getDefaultConfig(),
        }));
    }

    /**@internal */
    static StateSerializer = new Serializer<TextState>();

    /**@internal */
    readonly config: Readonly<TextConfig>;
    /**@internal */
    public readonly transformState: TransformState<TransformDefinitions.TextTransformProps>;
    /**@internal */
    public state: TextState;
    /**@internal */
    private userConfig: Config<ITextUserConfig>;

    constructor(config: Partial<ITextUserConfig>);
    constructor(text: string, config?: Partial<ITextUserConfig>);
    constructor(arg0: Partial<ITextUserConfig> | string, arg1: Partial<ITextUserConfig> = {}) {
        super();
        const config = typeof arg0 === "string" ? {
            ...arg1,
            text: arg0,
        } : arg0;
        const userConfig = Text.DefaultUserConfig.create(config);
        const textConfig = Text.DefaultTextConfig.create(userConfig.get());

        this.userConfig = userConfig;
        this.config = textConfig.get();
        this.state = this.getInitialState();
        this.transformState = this.getInitialTransformState(userConfig);
    }

    /**
     * Set the text of the Text
     * @chainable
     * @example
     * ```ts
     * text.setText("After that, another story happened...");
     * ```
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
     * @example
     * ```ts
     * element.setFontColor("#f00", 1000, "easeInOut");
     * ```
     */
    public setFontColor(color: Color, duration: number = 0, easing?: TransformDefinitions.EasingDefinition): Proxied<Text, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformDefinitions.TextTransformProps>({
            fontColor: color,
        }, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set the font size of the Text
     * @chainable
     * @example
     * ```ts
     * element.setFontSize(20, 1000, "easeInOut");
     * ```
     */
    public setFontSize(fontSize: number, duration: number = 0, easing?: TransformDefinitions.EasingDefinition): Proxied<Text, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            if (duration) {
                const transition: TextTransition = new FontSize({fontSize, duration, easing}) as TextTransition;
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

    /**
     * Override the layer used to render this text.
     * @param layer - The layer to assign to the text.
     */
    public useLayer(layer: Layer): this {
        this.userConfig.get().layer = layer;
        Object.assign(this.config, {layer});
        return this;
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
        this.transformState.resetTo(
            TransformState.deserialize<TransformDefinitions.TextTransformProps>(data.transformState).get());
        return this;
    }

    /**@internal */
    _init(scene?: Scene): DisplayableAction<typeof DisplayableActionTypes.init, Text> {
        return new DisplayableAction<typeof DisplayableActionTypes.init, Text>(
            this.chain(),
            DisplayableActionTypes.init,
            new ContentNode<DisplayableActionContentType["displayable:init"]>().setContent([
                scene || null, this.config.layer || null
            ])
        );
    }

    /**@internal */
    override reset() {
        super.reset();
        this.state = this.getInitialState();
        this.transformState.resetTo(this.getInitialTransformState(this.userConfig).get());
    }

    /**@internal */
    private getInitialTransformState(
        userConfig: Config<ITextUserConfig, EmptyObject>
    ): TransformState<TransformDefinitions.TextTransformProps> {
        const [transformState] = userConfig.extract(Text.DefaultTextTransformState.keys());
        return new TransformState(Text.DefaultTextTransformState.create(transformState.get()).get());
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

    /**@internal */
    private getInitialState(): MergeConfig<TextState> {
        return Text.DefaultTextState.create({
            fontSize: this.userConfig.get().fontSize,
            text: this.userConfig.get().text,
        }).get();
    }
}

