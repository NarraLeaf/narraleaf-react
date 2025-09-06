import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {RuntimeScriptError, Utils} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {TransformState} from "../transform/transform";
import {Color, CommonDisplayableConfig, ImageSrc, StaticImageData} from "@core/types";
import {DisplayableActionContentType, DisplayableActionTypes, ImageActionContentType} from "@core/action/actionTypes";
import {LogicAction} from "@core/game";
import {EmptyObject} from "@core/elements/transition/type";
import {IPosition, PositionUtils, RawPosition} from "@core/elements/transform/position";
import {FlexibleTuple, SelectElementFromEach, Serializer} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {Control} from "@core/elements/control";
import {ImageAction} from "@core/action/actions/imageAction";
import {Displayable} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Config, ConfigConstructor, MergeConfig} from "@lib/util/config";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Layer} from "@core/elements/layer";

export type TagDefinition<T extends TagGroupDefinition | null> =
    T extends TagGroupDefinition ? TagDefinitionObject<T> : never;
export type TagDefinitionObject<T extends TagGroupDefinition> = {
    groups: T;
    defaults: SelectElementFromEach<T>;
    resolve: TagSrcResolver<T>;
};

type ImageSrcType<T extends TagGroupDefinition | null = TagGroupDefinition | null> =
    T extends TagGroupDefinition ? TagDefinition<T> : (Color | ImageSrc);
type ImageConfig<Tag extends TagGroupDefinition | null = TagGroupDefinition | null> = {
    wearables: Image[];
    isWearable: boolean;
    name: string;
    autoInit: boolean;
    src: Tag extends TagGroupDefinition ? TagDefinitionObject<Tag> : null;
    autoFit: boolean;
    layer: Layer | undefined;
    isBackground: boolean;
};
type ImageState<Tag extends TagGroupDefinition | null = TagGroupDefinition | null> = {
    currentSrc: Tag extends null
        ? (ImageSrc | Color) : Tag extends TagGroupDefinition
            ? SelectElementFromEach<Tag> : SelectElementFromEach<Tag>;
    darkness: number;
};

export interface IImageUserConfig<Tag extends TagGroupDefinition | null = TagGroupDefinition | null>
    extends CommonDisplayableConfig {
    /**
     * The name of the image, only for debugging purposes
     */
    name: string;
    /**
     * If set to false, the image won't be initialized unless you call `init` method
     * @default true
     */
    autoInit: boolean;
    /**
     * Image Src, see [Image](https://react.narraleaf.com/documentation/core/elements/image) for more information
     */
    src: ImageSrcType<Tag>;
    /**
     * Auto resize image's width to fit the screen
     * @default false
     */
    autoFit: boolean;
    /**
     * layer of the image
     */
    layer?: Layer;
    /**
     * Darkness of the image, between 0 and 1
     * @default 0
     */
    darkness?: number;
}

/**@internal */
export type ImageDataRaw = {
    state: Record<string, any>;
    transformState: Record<string, any>;
};
export type TagGroupDefinition = string[][];
export type TagSrcResolver<T extends TagGroupDefinition> = (...tags: SelectElementFromEach<T>) => string;


export class Image<
    Tags extends TagGroupDefinition | null = TagGroupDefinition | null
>
    extends Displayable<ImageDataRaw, Image, TransformDefinitions.ImageTransformProps>
    implements EventfulDisplayable {

    /**@internal */
    public static DefaultImagePlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'></svg>";

    /**@internal */
    static StateSerializer = new Serializer<ImageState>();

    /**
     * @internal
     * {@link IImageUserConfig}
     */
    static DefaultUserConfig = new ConfigConstructor<IImageUserConfig, {
        position: IPosition;
    }>({
        name: "(anonymous)",
        autoInit: true,
        src: Image.DefaultImagePlaceholder,
        autoFit: false,
        layer: undefined,
        ...TransformState.DefaultTransformState.getDefaultConfig(),
    }, {
        position: (value: RawPosition | IPosition | undefined) => {
            return PositionUtils.tryParsePosition(value);
        }
    });

    /**
     * @internal
     * {@link ImageConfig}
     */
    static DefaultImageConfig = new ConfigConstructor<ImageConfig, EmptyObject>({
        wearables: [],
        isWearable: false,
        name: "(anonymous)",
        autoInit: true,
        src: null,
        autoFit: false,
        layer: undefined,
        isBackground: false,
    });

    /**
     * @internal
     * {@link ImageState}
     */
    static DefaultImageState = new ConfigConstructor<ImageState, EmptyObject>({
        currentSrc: Image.DefaultImagePlaceholder,
        darkness: 0,
    });

    /**@internal */
    static getInitialSrc(userConfig: IImageUserConfig): string | Color | SelectElementFromEach<TagGroupDefinition> {
        if (this.isTagDefinition(userConfig.src)) {
            return [...userConfig.src.defaults];
        }

        const userSrc = userConfig.src;
        if (Utils.isStaticImageData(userSrc)) {
            return Utils.srcToURL(userSrc);
        } else if (Utils.isColor(userSrc)) {
            return userSrc;
        } else if (Utils.isImageSrc(userSrc)) {
            return Utils.srcToURL(userSrc);
        }
        return Image.DefaultImagePlaceholder;
    }

    /**@internal */
    static isTagSrc(image: Image): image is Image<TagGroupDefinition> {
        return !!image.config.src;
    }

    /**@internal */
    static isTagDefinition(src: ImageSrcType): src is TagDefinitionObject<TagGroupDefinition> {
        return typeof src === "object"
            && src !== null
            && !Utils.isImageSrc(src)
            && !Utils.isColor(src)
            && "defaults" in src;
    }

    /**@internal */
    static isStaticSrc(image: Image): image is Image<null> {
        const src = image.userConfig.get().src;
        return !this.isTagSrc(image) && (Utils.isImageSrc(src) || Utils.isColor(src));
    }

    /**@internal */
    public static getSrcURL(image: Image | string): string | null {
        if (typeof image === "string") {
            return image;
        } else if (Image.isTagSrc(image)) {
            return Image.getSrcFromTags(image.state.currentSrc as string[], image.config.src.resolve);
        } else if (Image.isStaticSrc(image)) {
            if (Utils.isStaticImageData(image.state.currentSrc)) {
                return Utils.srcToURL(image.state.currentSrc);
            } else if (Utils.isColor(image.state.currentSrc)) {
                return null;
            }
            return image.state.currentSrc as Exclude<Color | ImageSrc, StaticImageData | Color>;
        }
        return null;
    }

    /**@internal */
    public static getSrcFromTags(
        tags: SelectElementFromEach<TagGroupDefinition> | string[],
        tagResolver: (...tags: SelectElementFromEach<TagGroupDefinition> | string[]) => string
    ): string {
        return tagResolver(...tags);
    }

    /**@internal */
    public static fromSrc(src: string): Image {
        return new Image({
            src: src,
        });
    }

    /**@internal*/
    public readonly config: Readonly<ImageConfig<Tags>>;
    /**@internal */
    public state: ImageState<Tags>;
    /**@internal */
    public transformState: TransformState<TransformDefinitions.ImageTransformProps>;
    /**@internal */
    private readonly userConfig: Config<IImageUserConfig<Tags>, { position: IPosition }>;

    constructor(config: Partial<IImageUserConfig<Tags>> = {}) {
        super();
        const userConfig = Image.DefaultUserConfig.create(config);
        const imageConfig = this.createImageConfig(userConfig);

        this.userConfig = userConfig as Config<IImageUserConfig<Tags>, { position: IPosition }>;
        this.config = imageConfig.get() as ImageConfig<Tags>;
        this.state = this.getInitialState();
        this.transformState = this.getInitialTransformState(userConfig);

        this.checkConfig().registerSrc();
    }

    /**
     * Set the source of the image
     *
     * - Tag-based image: the src will be resolved from the tags
     * - Static image: the src will be a string or StaticImageData
     * @example
     * ```ts
     * image.char("path/to/image.png", new Dissolve(1000));
     * ```
     * @example
     * ```ts
     * image.char(["happy", "t-shirt", "shorts"], new Dissolve(1000));
     * ```
     * @chainable
     */
    public char(src: ImageSrc | Color, transition?: ImageTransition): Proxied<Image, Chained<LogicAction.Actions>>;

    public char(tags: SelectElementFromEach<Tags> | FlexibleTuple<SelectElementFromEach<Tags>>, transition?: ImageTransition): Proxied<Image, Chained<LogicAction.Actions>>;

    public char(arg0: ImageSrc | Color | SelectElementFromEach<Tags> | FlexibleTuple<SelectElementFromEach<Tags>>, transition?: ImageTransition): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            if (Utils.isImageSrc(arg0) || Utils.isColor(arg0)) {
                if (Utils.isColor(arg0) && !this.config.isBackground) {
                    throw new Error("Color src is not allowed for non-background image");
                }
                return chain.chain(this._setSrc(chain, arg0, transition));
            } else {
                const action = new ImageAction<typeof ImageAction.ActionTypes.setAppearance>(
                    chain,
                    ImageAction.ActionTypes.setAppearance,
                    new ContentNode<ImageActionContentType["image:setAppearance"]>().setContent([
                        arg0,
                        transition?.copy() as ImageTransition | undefined,
                    ])
                );
                return chain
                    .chain(action)
                    .chain(this._flush());
            }
        });
    }

    /**
     * Set the darkness of the image
     * @param darkness - The darkness of the image, between 0 and 1
     * @chainable
     */
    public darken(darkness: number, duration?: number, easing?: TransformDefinitions.EasingDefinition): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            return chain.chain(this._setDarkness(chain, darkness, duration, easing));
        });
    }

    /**
     * Add a wearable to the image
     * @param children - Wearable image or images
     */
    public addWearable(children: Image | Image[]): this {
        const wearables = Array.isArray(children) ? children : [children];
        for (const child of wearables) {
            if (child === this) {
                throw new RuntimeScriptError("Cannot add self as a wearable");
            }
            this.config.wearables.push(child);
            Object.assign(child.config, {
                isWearable: true,
            });
        }
        return this;
    }

    /**
     * Add a wearable to the image
     *
     * Alias of {@link Image.addWearable}
     * @param children - Wearable image or images
     */
    public wear(children: Image | Image[]): this {
        return this.addWearable(children);
    }

    /**
     * Bind this image to a parent image as a wearable
     * @param parent - The parent image
     */
    public bindWearable(parent: Image): this {
        return parent.addWearable([this]) as this;
    }

    /**
     * Bind this image to a parent image as a wearable
     *
     * Alias of {@link Image.bindWearable}
     * @param parent - The parent image
     */
    public asWearableOf(parent: Image): this {
        return this.bindWearable(parent);
    }

    /**
     * Use layer for the image, will override the layer in the image config
     */
    public useLayer(layer: Layer | null): this {
        this.userConfig.get().layer = layer || undefined;
        Object.assign(this.config, {
            layer: layer || undefined,
        });
        return this;
    }

    /**@internal */
    toData(): ImageDataRaw {
        return {
            state: Image.StateSerializer.serialize(this.state),
            transformState: TransformState.TransformStateSerializer.serialize(
                this.transformState.get(),
            ),
        };
    }

    /**@internal */
    fromData(data: ImageDataRaw): this {
        this.state = Image.StateSerializer.deserialize(data.state);
        this.transformState =
            TransformState.deserialize<TransformDefinitions.ImageTransformProps>(data.transformState);
        return this;
    }

    /**@internal */
    _applyTransition(transition: ImageTransition, handler: (transition: ImageTransition) => ImageTransition): DisplayableAction<typeof DisplayableActionTypes.applyTransition, Image> {
        return new DisplayableAction<typeof DisplayableActionTypes.applyTransition, Image, ImageTransition>(
            this.chain(),
            DisplayableActionTypes.applyTransition,
            new ContentNode<DisplayableActionContentType<ImageTransition>["displayable:applyTransition"]>().setContent([
                transition,
                handler,
            ])
        );
    }

    /**@internal */
    _init(scene: Scene, layer?: Layer): DisplayableAction<typeof DisplayableActionTypes.init, Image> {
        return new DisplayableAction<typeof DisplayableActionTypes.init, Image>(
            this.chain(),
            DisplayableActionTypes.init,
            new ContentNode<DisplayableActionContentType<ImageTransition>["displayable:init"]>().setContent([
                scene,
                layer || this.config.layer || null,
            ])
        );
    }

    /**@internal */
    _initWearable(child: Image): ImageAction<typeof ImageAction.ActionTypes.initWearable> {
        return new ImageAction<typeof ImageAction.ActionTypes.initWearable>(
            this.chain(),
            ImageAction.ActionTypes.initWearable,
            new ContentNode<[Image]>().setContent([
                child
            ])
        );
    }

    /**@internal */
    _flush(): ImageAction<typeof ImageAction.ActionTypes.flush> {
        return new ImageAction<typeof ImageAction.ActionTypes.flush>(
            this.chain(),
            ImageAction.ActionTypes.flush,
            new ContentNode()
        );
    }

    /**@internal */
    override reset(): this {
        this.state = this.getInitialState();
        this.transformState = this.getInitialTransformState(this.userConfig);
        return this;
    }

    /**
     * @internal
     * resolve tags, return the tags that aren't conflicting
     */
    resolveTags(
        oldTags: SelectElementFromEach<Tags> | string[],
        newTags: SelectElementFromEach<Tags> | string[]
    ): string[] {
        if (!Image.isTagSrc(this)) {
            throw new Error("Tag not defined\nTag must be defined in the image config");
        }
        const tagMap: Map<string, string[]> = this.constructTagMap(this.config.src.groups);
        const result: Map<string[], string | null> = new Map();
        const resultTags: string[] = [];
        this.config.src.groups.forEach(group => {
            result.set(group, null);
        });

        const resolve = (tags: SelectElementFromEach<Tags> | string[]) => {
            tags.forEach(tag => {
                const group = tagMap.get(tag);
                if (!group) return;

                result.set(group, tag);
            });
        };

        resolve(oldTags);
        resolve(newTags);

        this.config.src.groups.forEach(group => {
            const tag = result.get(group);
            if (!tag) {
                throw new Error(`Invalid Tag Group. Tag group "${group.join(", ")}" is not resolved`);
            }
            resultTags.push(tag);
        });

        return resultTags;
    }

    /**@internal */
    _mixedSrcError(): TypeError {
        throw new RuntimeScriptError(
            "Trying to mix src and tags \n" +
            "To better understand the behavior of the image, you cannot mix static src and tags in the same image. ");
    }

    /**@internal */
    _invalidSrcHandlerError(): Error {
        throw new Error("Invalid src handler, " +
            "If you are using tags, config.src must be a function that resolves the src from the tags. " +
            "If you are using src, config.src must be a string or StaticImageData");
    }

    /**@internal */
    _invalidWearableError(trace: string): Error {
        throw new Error("Invalid wearable\nWearable must be an Image with isWearable set to true" +
            "\nIt seems like you are trying to add a non-wearable image to wearables" +
            "\nImage below violates the rule:\n" + trace);
    }

    /**@internal */
    _invalidTagGroupDefinitionError(): Error {
        throw new Error("Invalid tag group definition. " +
            "Tags in groups must be unique and not conflicting with each other.");
    }

    /**@internal */
    _setSrc(
        chain: Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>,
        src: ImageSrc | Color,
        transition?: ImageTransition
    ): ImageAction<typeof ImageAction.ActionTypes.setSrc> {
        if (transition) {
            chain.chain(this._applyTransition(
                transition.copy() as ImageTransition,
                (transition: ImageTransition) => {
                    return transition
                        ._setPrevSrc(ImageAction.resolveCurrentSrc(this))
                        ._setTargetSrc(src);
                }
            ));
        }
        return new ImageAction<typeof ImageAction.ActionTypes.setSrc>(
            chain as Proxied<Image, Chained<LogicAction.Actions>>,
            ImageAction.ActionTypes.setSrc,
            new ContentNode<ImageActionContentType["image:setSrc"]>().setContent([
                src
            ])
        );
    }

    /**@internal */
    _setIsBackground(isBackground: boolean): this {
        Object.assign(this.config, {
            isBackground: isBackground,
        });
        return this;
    }

    /**@internal */
    private registerSrc(): this {
        if (Image.isTagSrc(this)) {
            this.srcManager.registerRawSrc(Image.getSrcFromTags(this.config.src.defaults, this.config.src.resolve));
        } else if (Utils.isImageSrc(this.state.currentSrc)) {
            this.srcManager.registerRawSrc(Utils.srcToURL(this.state.currentSrc));
        }
        return this;
    }

    /**@internal */
    private createImageConfig(userConfig: Config<IImageUserConfig, {
        position: IPosition
    }>): Config<ImageConfig> {
        const userConfigRaw = userConfig.get();
        return Image.DefaultImageConfig.create({
            ...userConfigRaw,
            src: Image.isTagDefinition(userConfigRaw.src)
                ? userConfigRaw.src
                : null,
        });
    }

    /**@internal */
    private getInitialState(): MergeConfig<ImageState> {
        return Image.DefaultImageState.create().assign({
            currentSrc: Image.getInitialSrc(this.userConfig.get()),
        }).get();
    }

    /**@internal */
    private getInitialTransformState(
        userConfig: Config<IImageUserConfig, { position: IPosition }>
    ): TransformState<TransformDefinitions.ImageTransformProps> {
        const [transformState] = userConfig.extract(TransformState.DefaultTransformState.keys());
        return new TransformState(TransformState.DefaultTransformState.create(transformState.get()).get());
    }

    /**@internal */
    private checkConfig(): this {
        // invalid-wearable error
        for (const wearable of this.config.wearables) {
            if (!wearable.config.isWearable) {
                throw this._invalidWearableError(JSON.stringify(wearable.config));
            }
        }
        if (Image.isTagSrc(this)) {
            // invalid-tag-group-definition error
            const src: TagDefinition<TagGroupDefinition> = this.config.src;
            const seen: Set<string> = new Set();
            for (const tags of src.groups) {
                for (const tag of tags) {
                    if (seen.has(tag)) {
                        throw this._invalidTagGroupDefinitionError();
                    }
                    seen.add(tag);
                }
            }

            // conflict-tag error
            // tag-not-found error
            const tagMap: Map<string, string[]> = this.constructTagMap(src.groups);
            const usedTags = new Set<string>();
            for (const tag of src.defaults) {
                if (usedTags.has(tag)) {
                    throw new Error(`Tag conflict\nTag "${tag}" is conflicting with another tag\nError found in config.tag.defaults`);
                }
                if (!tagMap.has(tag)) {
                    throw new Error(`Tag not found\nTag "${tag}" is not defined in tagDefinitions\nError found in config.tag.defaults`);
                }
                tagMap.get(tag)?.forEach(t => usedTags.add(t));
            }
        }

        return this;
    }

    /**@internal */
    private constructTagMap(definitions: TagGroupDefinition): Map<string, string[]> {
        const tagMap: Map<string, string[]> = new Map();
        for (const tags of definitions) {
            for (const tag of tags) {
                tagMap.set(tag, tags);
            }
        }
        return tagMap;
    }

    /**@internal */
    _setDarkness(
        chain: Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>,
        darkness: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): ImageAction<typeof ImageAction.ActionTypes.setDarkness> {
        return new ImageAction<typeof ImageAction.ActionTypes.setDarkness>(
            chain as Proxied<Image, Chained<LogicAction.Actions>>,
            ImageAction.ActionTypes.setDarkness,
            new ContentNode<ImageActionContentType["image:setDarkness"]>().setContent([
                darkness, duration, easing
            ])
        );
    }
}
