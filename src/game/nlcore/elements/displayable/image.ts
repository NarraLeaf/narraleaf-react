import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {Utils} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {Transform, TransformState} from "../transform/transform";
import {Color, CommonDisplayableConfig, ImageSrc, StaticImageData} from "@core/types";
import {ImageActionContentType} from "@core/action/actionTypes";
import {LogicAction} from "@core/game";
import {EmptyObject, IImageTransition, ITransition} from "@core/elements/transition/type";
import {IPosition, PositionUtils, RawPosition} from "@core/elements/transform/position";
import {EventDispatcher, getCallStack, SelectElementFromEach, Serializer} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {Control} from "@core/elements/control";
import {ImageAction} from "@core/action/actions/imageAction";
import {Displayable, DisplayableEventTypes} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Config, ConfigConstructor, MergeConfig} from "@lib/util/config";

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
};
type ImageState<Tag extends TagGroupDefinition | null = TagGroupDefinition | null> = {
    display: boolean;
    currentSrc: ImageSrc | Color | SelectElementFromEach<Tag>;
};

export interface IImageUserConfig<Tag extends TagGroupDefinition | null = TagGroupDefinition | null>
    extends CommonDisplayableConfig {
    /**
     * The wearables of the image, see [addWearable](https://react.narraleaf.com/documentation/core/elements/image#addwearable) for more information
     */
    wearables?: Image[];
    /**
     * Set to true if this image is used as a wearable
     * @default false
     */
    isWearable?: boolean;
    /**
     * The name of the image, only for debugging purposes
     */
    name?: string;
    /**
     * If set to false, the image won't be initialized unless you call `init` method
     * @default true
     */
    autoInit?: boolean;
    /**
     * Image Src, see [Image](https://react.narraleaf.com/documentation/core/elements/image) for more information
     */
    src: ImageSrcType<Tag>;
}

/**@internal */
export type ImageDataRaw = {
    state: Record<string, any>;
    transformState: Record<string, any>;
};

/**@internal */
export type ImageEventTypes = {
    "event:wearable.create": [Image];
} & DisplayableEventTypes;
/**@internal */
export type TagGroupDefinition = string[][];
/**@internal */
export type TagSrcResolver<T extends TagGroupDefinition> = (...tags: SelectElementFromEach<T>) => string;


export class Image<
    Tags extends TagGroupDefinition | null = TagGroupDefinition | null
>
    extends Displayable<ImageDataRaw, Image>
    implements EventfulDisplayable {

    /**@internal */
    static EventTypes: { [K in keyof ImageEventTypes]: K } = {
        ...Displayable.EventTypes,
        "event:wearable.create": "event:wearable.create",
    };
    /**@internal */
    public static DefaultImagePlaceholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

    /**@internal */
    static StateSerializer = new Serializer<ImageState>();

    /**
     * @internal
     * {@link IImageUserConfig}
     */
    static DefaultUserConfig = new ConfigConstructor<IImageUserConfig, {
        position: IPosition;
    }>({
        wearables: [],
        isWearable: false,
        name: "(anonymous)",
        autoInit: true,
        src: Image.DefaultImagePlaceholder,
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
    });

    /**
     * @internal
     * {@link ImageState}
     */
    static DefaultImageState = new ConfigConstructor<ImageState, EmptyObject>({
        display: false,
        currentSrc: Image.DefaultImagePlaceholder,
    });

    /**@internal */
    static getInitialSrc(image: Image): string | Color | SelectElementFromEach<TagGroupDefinition> {
        if (this.isTagSrc(image)) {
            return [...image.config.src.defaults];
        } else if (this.isStaticSrc(image)) {
            const userSrc = image.userConfig.get().src;
            if (Utils.isStaticImageData(userSrc)) {
                return Utils.staticImageDataToSrc(userSrc);
            } else if (Utils.isColor(userSrc)) {
                return userSrc;
            } else if (Utils.isImageSrc(userSrc)) {
                return Utils.srcToString(userSrc);
            }
            return userSrc;
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
        return !this.isTagSrc(image) && Utils.isImageSrc(image.userConfig.get().src);
    }

    /**@internal */
    public static getSrcURL(image: Image): string | null {
        if (Image.isTagSrc(image)) {
            return Image.getSrcFromTags(image.state.currentSrc as string[], image.config.src.resolve);
        } else if (Image.isStaticSrc(image)) {
            if (Utils.isStaticImageData(image.state.currentSrc)) {
                return Utils.staticImageDataToSrc(image.state.currentSrc);
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
    public readonly events: EventDispatcher<ImageEventTypes> = new EventDispatcher();
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

        this.checkConfig();
    }

    /**
     * Set the source of the image
     *
     * - Tag-based image: the src will be resolved from the tags
     * - Static image: the src will be a string or StaticImageData
     * @example
     * ```ts
     * image.char("path/to/image.png", new Fade(1000));
     * ```
     * @example
     * ```ts
     * image.char(["happy", "t-shirt", "shorts"], new Fade(1000));
     * ```
     * @chainable
     */
    public char(src: ImageSrc | Color, transition?: IImageTransition): Proxied<Image, Chained<LogicAction.Actions>>;

    public char(tags: SelectElementFromEach<Tags>, transition?: IImageTransition): Proxied<Image, Chained<LogicAction.Actions>>;

    public char(arg0: ImageSrc | Color | SelectElementFromEach<Tags>, transition?: IImageTransition): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            if (Utils.isImageSrc(arg0) || Utils.isColor(arg0)) {
                return chain.chain(this._setSrc(chain, arg0, transition));
            } else {
                const action = new ImageAction<typeof ImageAction.ActionTypes.setAppearance>(
                    chain,
                    ImageAction.ActionTypes.setAppearance,
                    new ContentNode<ImageActionContentType["image:setAppearance"]>().setContent([
                        arg0,
                        transition?.copy(),
                    ])
                );
                return chain
                    .chain(action)
                    .chain(this._flush());
            }
        });

    }

    /**
     * Apply a transform to the image
     * @example
     * ```ts
     * // shake the image
     *
     * image.applyTransform(
     *     new Transform([
     *         {
     *             props: {
     *                 position: new Coord2D({
     *                     xoffset: 10,
     *                 })
     *             },
     *             options: {
     *                 duration: 100,
     *             }
     *         },
     *         {
     *             props: {
     *                 position: new Coord2D({
     *                     xoffset: -10,
     *                 })
     *             },
     *             options: {
     *                 duration: 100,
     *             }
     *         }
     *     ]).repeat(3);
     * );
     * ```
     * @chainable
     */
    public transform(transform: Transform<TransformDefinitions.ImageTransformProps>): Proxied<Image, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        return chain.chain(new ImageAction<typeof ImageAction.ActionTypes.applyTransform>(
            chain,
            ImageAction.ActionTypes.applyTransform,
            new ContentNode().setContent([
                void 0,
                transform.copy(),
                getCallStack()
            ])
        ));
    }

    /**
     * Show the image
     *
     * if options are provided, the image will show with the provided transform options
     * @example
     * ```ts
     * image.show({
     *     duration: 1000,
     * });
     * ```
     * @chainable
     */
    public show(): Proxied<Image, Chained<LogicAction.Actions>>;

    public show(options: Transform<TransformDefinitions.ImageTransformProps>): Proxied<Image, Chained<LogicAction.Actions>>;

    public show(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>>;

    public show(options?: Transform<TransformDefinitions.ImageTransformProps> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>> {
        const trans =
            (options instanceof Transform) ? options.copy() : new Transform<TransformDefinitions.ImageTransformProps>([
                {
                    props: {
                        opacity: 1,
                    },
                    options: options || {}
                }
            ]);
        return this.combineActions(new Control(), chain => {
            const action = new ImageAction<typeof ImageAction.ActionTypes.show>(
                chain,
                ImageAction.ActionTypes.show,
                new ContentNode<ImageActionContentType["image:show"]>().setContent([
                    void 0,
                    trans
                ])
            );
            return chain
                .chain(action)
                .chain(this._flush());
        });
    }

    /**
     * Hide the image
     * @chainable
     */
    public hide(): Proxied<Image, Chained<LogicAction.Actions>>;

    public hide(transform: Transform<TransformDefinitions.ImageTransformProps>): Proxied<Image, Chained<LogicAction.Actions>>;

    public hide(transform: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>>;

    public hide(arg0?: Transform<TransformDefinitions.ImageTransformProps> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.combineActions(
            new Control(),
            chain => {
                const action = new ImageAction<typeof ImageAction.ActionTypes.hide>(
                    chain,
                    ImageAction.ActionTypes.hide,
                    new ContentNode<ImageActionContentType["image:hide"]>().setContent([
                        void 0,
                        (arg0 instanceof Transform) ? arg0.copy() : new Transform<TransformDefinitions.ImageTransformProps>([
                            {
                                props: {
                                    opacity: 0,
                                },
                                options: arg0 || {}
                            }
                        ])
                    ])
                );
                return chain
                    .chain(action)
                    .chain(this._flush());
            });
    }

    /**
     * Add a wearable to the image
     * @param children - Wearable image or images
     */
    public addWearable(children: Image | Image[]): this {
        const wearables = Array.isArray(children) ? children : [children];
        for (const child of wearables) {
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
        parent.addWearable([this as Image]);
        return this;
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
    _applyTransition(transition: ITransition): ImageAction<"image:applyTransition"> {
        return new ImageAction<"image:applyTransition">(
            this.chain(),
            "image:applyTransition",
            new ContentNode<[ITransition]>().setContent([
                transition
            ])
        );
    }

    /**@internal */
    _init(scene?: Scene): ImageAction<typeof ImageAction.ActionTypes.init> {
        return new ImageAction<typeof ImageAction.ActionTypes.init>(
            this.chain(),
            ImageAction.ActionTypes.init,
            new ContentNode<[Scene?]>().setContent([
                scene
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
    override reset() {
        this.state = this.getInitialState();
        this.transformState = this.getInitialTransformState(this.userConfig);
    }

    /**
     * @internal
     * resolve tags, return the tags that aren't conflicting
     */
    resolveTags(
        oldTags: SelectElementFromEach<Tags> | string[],
        newTags: SelectElementFromEach<Tags> | string[]
    ): SelectElementFromEach<Tags> {
        if (!Image.isTagSrc(this)) {
            throw new Error("Tag not defined\nTag must be defined in the image config");
        }
        const tagMap: Map<string, string[]> = this.constructTagMap(this.config.src.groups);
        const resultTags: Set<string> = new Set();

        const resolve = (tags: SelectElementFromEach<Tags> | string[]) => {
            for (const tag of tags) {
                const conflictGroup = tagMap.get(tag);
                if (!conflictGroup) continue;

                for (const conflictTag of conflictGroup) {
                    resultTags.delete(conflictTag);
                }
                resultTags.add(tag);
            }
        };

        resolve(oldTags);
        resolve(newTags);

        return Array.from(resultTags) as SelectElementFromEach<Tags>;
    }

    /**@internal */
    _mixedSrcError(): TypeError {
        throw new TypeError(
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
        transition?: IImageTransition
    ): ImageAction<typeof ImageAction.ActionTypes.setSrc> {
        if (transition) {
            const copy = transition.copy();
            copy.setSrc(src);
            chain.chain(this._applyTransition(copy));
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
    __setDisplayState(display: boolean): this {
        this.state.display = display;
        return this;
    }

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

    private getInitialState(): MergeConfig<ImageState> {
        return Image.DefaultImageState.create().assign({
            currentSrc: Image.getInitialSrc(this),
        }).get();
    }

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
}
