import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {RuntimeScriptError, Utils} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {TransformState} from "../transform/transform";
import {Color, ImageSrc, StaticImageData} from "@core/types";
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
    src: Tag extends TagGroupDefinition ? ResolvedSrcDefinition : null;
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

export interface IImageUserConfig<
    Tag extends TagGroupDefinition | null = TagGroupDefinition | null,
    Layers extends LayerGroupDefinition = LayerGroupDefinition,
>
    extends TransformDefinitions.ImageTransformProps {
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
    src: ImageSrcType<Tag> | LayeredDefinition<Layers>;
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

/**
 * A set of mutually exclusive variants for one layer, keyed by tag.
 *
 * `null` means the layer draws nothing for that tag.
 */
export type LayerVariants = Record<string, string | null>;
/**
 * Derives a layer's src from the currently active tags. Declares no tags of its own.
 */
export type LayerResolver = (tags: ReadonlySet<string>) => string | null;
/**
 * One slot of a layered image, from bottom to top. Either a constant src, `null`,
 * a {@link LayerVariants} map, or a {@link LayerResolver}.
 */
export type LayerSlot = string | null | LayerVariants | LayerResolver;
export type LayerGroupDefinition = readonly LayerSlot[];
/**
 * The union of every tag declared by a layer stack.
 */
export type LayerTagsOf<L> = L extends readonly (infer E)[]
    ? (E extends LayerResolver ? never : E extends LayerVariants ? keyof E & string : never)
    : never;
/**
 * Layered image src, see [Image](https://react.narraleaf.com/documentation/core/elements/image).
 */
export type LayeredDefinition<L extends LayerGroupDefinition = LayerGroupDefinition> = {
    /**
     * The layer stack, from bottom to top. Array order is the stacking order.
     */
    layers: L;
    /**
     * One tag per variant layer, in any order.
     */
    defaults: readonly LayerTagsOf<L>[];
};

/**
 * @internal
 * Both src shapes normalize to this: tags always resolve through `groups`/`defaults`,
 * and only the final tags-to-src step differs (`resolve` for pre-composited, `slots` for layered).
 */
export type ResolvedSrcDefinition = {
    groups: TagGroupDefinition;
    defaults: string[];
    resolve: TagSrcResolver<TagGroupDefinition> | null;
    slots: readonly LayerSlot[] | null;
};


export class Image<
    Tags extends TagGroupDefinition | null = TagGroupDefinition | null,
    const Layers extends LayerGroupDefinition = LayerGroupDefinition
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
        if (this.isLayeredDefinition(userConfig.src) || this.isTagDefinition(userConfig.src)) {
            return [...userConfig.src.defaults] as SelectElementFromEach<TagGroupDefinition>;
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
    static isLayeredSrc(image: Image): boolean {
        return !!image.config.src?.slots;
    }

    /**@internal */
    static isSrcDefinitionObject(src: ImageSrcType | LayeredDefinition): src is
        TagDefinitionObject<TagGroupDefinition> | LayeredDefinition {
        return typeof src === "object"
            && src !== null
            && !Utils.isImageSrc(src)
            && !Utils.isColor(src);
    }

    /**@internal */
    static isLayeredDefinition(src: ImageSrcType | LayeredDefinition): src is LayeredDefinition {
        return this.isSrcDefinitionObject(src) && "layers" in src;
    }

    /**@internal */
    static isTagDefinition(src: ImageSrcType | LayeredDefinition): src is TagDefinitionObject<TagGroupDefinition> {
        return this.isSrcDefinitionObject(src) && "resolve" in src;
    }

    /**@internal */
    static isLayerVariants(slot: LayerSlot): slot is LayerVariants {
        return typeof slot === "object" && slot !== null;
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
        } else if (Image.isLayeredSrc(image)) {
            return null;
        } else if (Image.isTagSrc(image) && image.config.src.resolve) {
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

    /**
     * @internal
     * Resolve tags into one src per layer, bottom to top. Defaults to the image's current tags.
     * A `null` entry means that layer draws nothing.
     */
    public static getSrcURLs(image: Image, tags?: string[]): (string | null)[] {
        const slots = image.config.src?.slots;
        if (!slots) {
            return [];
        }
        const tagSet: ReadonlySet<string> = new Set(tags ?? image.state.currentSrc as string[]);
        return slots.map(slot => Image.resolveLayerSlot(slot, tagSet));
    }

    /**@internal */
    public static resolveLayerSlot(slot: LayerSlot, tags: ReadonlySet<string>): string | null {
        if (slot === null || typeof slot === "string") {
            return slot;
        }
        if (typeof slot === "function") {
            return slot(tags);
        }
        for (const [tag, src] of Object.entries(slot)) {
            if (tags.has(tag)) {
                return src;
            }
        }
        return null;
    }

    /**
     * @internal
     * Every src a layer stack can ever show. Layers are independent, so this is the sum of
     * all variants rather than their cross product. Resolver slots are opaque and skipped.
     */
    public static getAllLayerSrc(image: Image): string[] {
        const slots = image.config.src?.slots;
        if (!slots) {
            return [];
        }
        const result: string[] = [];
        for (const slot of slots) {
            if (typeof slot === "string") {
                result.push(slot);
            } else if (Image.isLayerVariants(slot)) {
                for (const src of Object.values(slot)) {
                    if (src !== null) {
                        result.push(src);
                    }
                }
            }
        }
        return result;
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

    /**
     * Construct an image element. The config can describe either static sources or tagged outfits, but not both.
     * @param config - Image metadata such as tags, source, layer, and wearables.
     * @example
     * ```ts
     * const image = new Image({
     *   src: {
     *     layers: [
     *       "body.png",
     *       {happy: "happy.png", sad: "sad.png"},
     *       {shirt: "shirt.png", coat: "coat.png"},
     *     ],
     *     defaults: ["happy", "shirt"],
     *   }
     * });
     * ```
     */
    constructor(config: Partial<IImageUserConfig<Tags, Layers>> = {}) {
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

    public char(tags: LayerTagsOf<Layers>[], transition?: ImageTransition): Proxied<Image, Chained<LogicAction.Actions>>;

    public char(
        arg0: ImageSrc | Color | SelectElementFromEach<Tags> | FlexibleTuple<SelectElementFromEach<Tags>> | LayerTagsOf<Layers>[],
        transition?: ImageTransition
    ): Proxied<Image, Chained<LogicAction.Actions>> {
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
     * Add wearable images that move with this image.
     * @param children - A wearable image or an array of wearables.
     * @example
     * ```ts
     * const hat = new Image({ src: "hat.png" });
     * image.addWearable(hat);
     * ```
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
     * Alias of {@link Image.addWearable}.
     * @param children - Wearable image or images
     */
    public wear(children: Image | Image[]): this {
        return this.addWearable(children);
    }

    /**
     * Bind this image as a wearable child of another image.
     * @param parent - The parent image that should carry this wearable.
     * @example
     * ```ts
     * childImage.bindWearable(parentImage);
     * ```
     */
    public bindWearable(parent: Image): this {
        return parent.addWearable([this]) as this;
    }

    /**
     * Alias of {@link Image.bindWearable}.
     * @param parent - The parent image
     */
    public asWearableOf(parent: Image): this {
        return this.bindWearable(parent);
    }

    /**
     * Assign a layer to the image, overriding the config.
     * @param layer - Layer instance or `null` to remove the override.
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

    /**
     * Apply an appearance to the image STATE synchronously — no transition, no action history,
     * no stack model. Mirrors the resolution {@link Image.char} performs before dispatching an
     * `ImageAction`: a `src`/`Color` replaces `currentSrc` directly; a tag list resolves against
     * the current appearance. The caller is responsible for the follow-up repaint
     * (`stage.update()` + `updateStyleSync()`/`flush()`).
     *
     * Used by text-event tokens, whose effect must land on element state (which is serialized)
     * without ever entering the execution stack.
     * @internal
     */
    _setAppearanceSync(appearance: ImageSrc | Color | string[]): void {
        if (Utils.isImageSrc(appearance) || Utils.isColor(appearance)) {
            if (Utils.isColor(appearance) && !this.config.isBackground) {
                throw new RuntimeScriptError("Color src is not allowed for non-background image");
            }
            this.state.currentSrc = appearance as typeof this.state.currentSrc;
            return;
        }
        if (!Image.isTagSrc(this)) {
            throw this._mixedSrcError();
        }
        const oldTags = this.state.currentSrc as string[];
        const newTags = this.resolveTags(oldTags, appearance);
        this.state.currentSrc = newTags as typeof this.state.currentSrc;
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
        const src = this.config.src;
        if (src?.slots) {
            Image.getAllLayerSrc(this as Image).forEach(layerSrc => this.srcManager.registerRawSrc(layerSrc));
        } else if (src?.resolve) {
            this.srcManager.registerRawSrc(Image.getSrcFromTags(src.defaults, src.resolve));
        } else if (Utils.isImageSrc(this.state.currentSrc)) {
            this.srcManager.registerRawSrc(Utils.srcToURL(this.state.currentSrc));
        }
        return this;
    }

    /**@internal */
    private static normalizeSrcDefinition(src: ImageSrcType | LayeredDefinition): ResolvedSrcDefinition | null {
        if (Image.isLayeredDefinition(src)) {
            return {
                groups: src.layers.filter(Image.isLayerVariants).map(slot => Object.keys(slot)),
                defaults: [...src.defaults],
                resolve: null,
                slots: src.layers,
            };
        }
        if (Image.isTagDefinition(src)) {
            return {
                groups: src.groups,
                defaults: [...src.defaults],
                resolve: src.resolve,
                slots: null,
            };
        }
        return null;
    }

    /**@internal */
    private createImageConfig(userConfig: Config<IImageUserConfig, {
        position: IPosition
    }>): Config<ImageConfig> {
        const userConfigRaw = userConfig.get();
        return Image.DefaultImageConfig.create({
            ...userConfigRaw,
            src: Image.normalizeSrcDefinition(userConfigRaw.src),
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
            const src: ResolvedSrcDefinition = this.config.src;
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

            // layer-without-default error
            if (src.slots) {
                const chosen = new Set(src.defaults);
                for (const group of src.groups) {
                    if (!group.some(tag => chosen.has(tag))) {
                        throw new RuntimeScriptError(
                            "Layer has no default\n" +
                            `The layer with tags "${group.join(", ")}" needs exactly one of them listed in src.defaults`
                        );
                    }
                }
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
