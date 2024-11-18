import React from "react";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {Actionable} from "@core/action/actionable";
import {Utils} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {Transform} from "./transform/transform";
import {CommonDisplayable, EventfulDisplayable, StaticImageData} from "@core/types";
import {ImageActionContentType} from "@core/action/actionTypes";
import {LogicAction} from "@core/game";
import {IImageTransition, ITransition} from "@core/elements/transition/type";
import {
    CommonPosition,
    CommonPositionType,
    D2Position,
    IPosition,
    PositionUtils
} from "@core/elements/transform/position";
import {
    deepEqual,
    deepMerge,
    EventDispatcher,
    FlexibleTuple,
    getCallStack,
    SelectElementFromEach
} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {Control} from "@core/elements/control";
import {ImageAction} from "@core/action/actions/imageAction";

export type ImageConfig = {
    display: boolean;
    disposed?: boolean;
    wearables: Image[];
    isWearable?: boolean;
    name?: string;
} & CommonDisplayable;

export type ImageDataRaw = {
    state: Record<string, any>;
};

export type ImageEventTypes = {
    "event:displayable.applyTransition": [ITransition];
    "event:displayable.applyTransform": [Transform];
    "event:displayable.init": [];
    "event:wearable.create": [Image];
};
export type TagDefinition = string[][];
export type RichImageConfig<T extends TagDefinition> = ImageConfig &
    {
        tagDefinitions: T;
        /**
         * Given the tags, return the URL of the image
         */
        tagResolver: (...tags: SelectElementFromEach<T>) => string;
    } &
    ({
        src: string | StaticImageData;
        tags: never[];
    } | {
        src: never;
        tags: SelectElementFromEach<T>;
    });
export type StaticRichConfig = RichImageConfig<TagDefinition>;


export class Image<
    Tags extends TagDefinition = TagDefinition
>
    extends Actionable<ImageDataRaw, Image>
    implements EventfulDisplayable {

    /**@internal */
    static EventTypes: { [K in keyof ImageEventTypes]: K } = {
        "event:displayable.applyTransition": "event:displayable.applyTransition",
        "event:displayable.applyTransform": "event:displayable.applyTransform",
        "event:displayable.init": "event:displayable.init",
        "event:wearable.create": "event:wearable.create",
    };
    /**@internal */
    static defaultConfig: RichImageConfig<TagDefinition> = {
        src: "",
        display: false,
        position: new CommonPosition(CommonPositionType.Center),
        scale: 1,
        rotation: 0,
        opacity: 0,
        isWearable: false,
        wearables: [],
        tagDefinitions: [],
        tags: [],
        tagResolver: () => {
            throw new Error("Tag resolver not implemented\nIf you are using tags, you must provide a tag resolver" +
                ",Tag resolver is a function that takes tags and returns the URL of the image" +
                ",You can provide a tag resolver in the config of the image. " +
                "\nExample: {tagResolver: (emotion, state) => `https://example.com/char_${emotion}_${state}.png`}");
        }
    };
    /**@internal */
    public static DefaultImagePlaceholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

    /**@internal */
    public static serializeImageState(state: Record<string, any>): Record<string, any> {
        const handlers: Record<string, ((value: any) => any)> = {
            position: (value: IPosition) => {
                return PositionUtils.serializePosition(value);
            }
        };
        const result: Record<string, any> = {};
        for (const key in state) {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                result[key] = handlers[key] ? handlers[key](state[key]) : state[key];
            }
        }
        return result;
    };

    /**@internal */
    public static deserializeImageState(state: Record<string, any>): StaticRichConfig {
        const handlers: Record<string, ((value: any) => any)> = {
            position: (value: D2Position) => {
                return PositionUtils.toCoord2D(value);
            }
        };
        const result: Record<string, any> = {};
        for (const key in state) {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                result[key] = handlers[key] ? handlers[key](state[key]) : state[key];
            }
        }
        return result as StaticRichConfig;
    }

    /**@internal */
    public static getSrc(state: StaticRichConfig): string {
        const {src, tags, tagResolver} = state;
        if (src) {
            return Utils.isStaticImageData(src) ? Utils.staticImageDataToSrc(src) : src;
        } else if (tags) {
            return Image.getSrcFromTags(tags as SelectElementFromEach<TagDefinition>, tagResolver);
        }
        return Image.DefaultImagePlaceholder;
    }

    /**@internal */
    public static getSrcFromTags(
        tags: SelectElementFromEach<TagDefinition>,
        tagResolver: (...tags: SelectElementFromEach<TagDefinition>) => string
    ): string {
        return tagResolver(...tags);
    }

    /**@internal */
    readonly name: string;
    /**@internal */
    readonly config: RichImageConfig<Tags>;
    /**@internal */
    readonly events: EventDispatcher<ImageEventTypes> = new EventDispatcher();
    /**@internal */
    ref: React.RefObject<HTMLDivElement> | undefined = undefined;
    /**@internal */
    state: RichImageConfig<Tags>;

    constructor(config: Partial<RichImageConfig<Tags>> = {}, tagDefinitions?: Tags) {
        super();
        this.name = config.name || "(anonymous)";
        this.config = deepMerge<RichImageConfig<Tags>>(Image.defaultConfig, config);

        if (tagDefinitions) this.config.tagDefinitions = tagDefinitions as Tags;
        if (this.config.position) this.config.position = PositionUtils.tryParsePosition(this.config.position);

        this.config.tags = config.tags || Image.defaultConfig.tags;
        this.state = deepMerge<RichImageConfig<Tags>>({}, this.config);
        this.checkConfig(this.config);
    }

    /**
     * Dispose of the image
     *
     * Normally, you don't need to dispose of the image manually
     * @chainable
     */
    public dispose() {
        return this._dispose();
    }

    /**@internal */
    init(): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.chain(this._init());
    }

    /**@internal */
    checkConfig(config: RichImageConfig<Tags>) {
        if (!Transform.isPosition(config.position)) {
            throw new Error("Invalid position\nPosition must be one of CommonImagePosition, Align, Coord2D");
        }
        if (config.src && config.tags.length && config.src !== Image.DefaultImagePlaceholder) {
            throw this._mixedSrcError();
        }
        if (!config.src && !config.tags.length) {
            throw this._srcNotSpecifiedError();
        }
        for (const wearable of config.wearables) {
            if (!wearable.config.isWearable) {
                throw new Error("Invalid wearable\nWearable must be an Image with isWearable set to true" +
                    "\nIt seems like you are trying to add a non-wearable image to wearables" +
                    "\nImage below violates the rule:\n" + JSON.stringify(wearable.config));
            }
        }

        // tags
        const tagMap: Map<string, string[]> = this.constructTagMap();
        const usedTags = new Set<string>();
        for (const tag of config.tags) {
            if (usedTags.has(tag)) {
                throw new Error(`Tag conflict\nTag "${tag}" is conflicting with another tag`);
            }
            if (!tagMap.has(tag)) {
                throw new Error(`Tag not found\nTag "${tag}" is not defined in tagDefinitions`);
            }
            tagMap.get(tag)?.forEach(t => usedTags.add(t));
        }

        return this;
    }

    /**
     * Set the source of the image
     *
     * Src could be a string, StaticImageData, or Scene
     *
     * If transition is provided, the image will transition to the new src
     * @param src
     * @param transition
     * @example
     * ```ts
     * import yourImage from "path/to/image.png";
     * image.setSrc(yourImage, new Fade(1000));
     * ```
     * @chainable
     */
    public setSrc(src: string | StaticImageData, transition?: IImageTransition): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            return this._setSrc(chain, src, transition);
        });
    }

    /**
     * Set the appearance of the image
     * @chainable
     */
    public setAppearance(tags: FlexibleTuple<SelectElementFromEach<Tags>>, transition?: IImageTransition): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            const action = new ImageAction<typeof ImageAction.ActionTypes.setAppearance>(
                chain,
                ImageAction.ActionTypes.setAppearance,
                new ContentNode<ImageActionContentType["image:setAppearance"]>().setContent([
                    tags,
                    transition?.copy(),
                ])
            );
            return chain
                .chain(action)
                .chain(this._flush());
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
    public applyTransform(transform: Transform<TransformDefinitions.ImageTransformProps>): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.combineActions(new Control(), chain => {
            const action = new ImageAction<typeof ImageAction.ActionTypes.applyTransform>(
                chain,
                ImageAction.ActionTypes.applyTransform,
                new ContentNode().setContent([
                    void 0,
                    transform.copy(),
                    getCallStack()
                ])
            );
            return chain
                .chain(action)
                .chain(this._flush());
        });
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
            child.config.isWearable = true;
        }
        return this;
    }

    /**
     * Bind this image to a parent image as a wearable
     */
    public bindWearable(parent: Image): this {
        parent.addWearable([this as Image]);
        return this;
    }

    /**
     * @internal
     * @deprecated
     */
    toTransform(): Transform<TransformDefinitions.ImageTransformProps> {
        return new Transform<TransformDefinitions.ImageTransformProps>(this.state, {
            duration: 0,
        });
    }

    /**@internal */
    setScope(scope: React.RefObject<HTMLDivElement>): this {
        this.ref = scope;
        return this;
    }

    /**@internal */
    getScope(): React.RefObject<HTMLDivElement> | undefined {
        return this.ref;
    }

    public copy(): Image<Tags> {
        return new Image<Tags>(this.config, this.config.tagDefinitions);
    }

    /**@internal */
    toData(): ImageDataRaw | null {
        if (this.state.disposed || deepEqual(this.state, this.config)) {
            return null;
        }

        return {
            state: deepMerge({}, Image.serializeImageState(this.state))
        };
    }

    /**@internal */
    fromData(data: ImageDataRaw): this {
        this.state = deepMerge<RichImageConfig<Tags>>(this.state, Image.deserializeImageState(data.state));
        return this;
    }

    /**@internal */
    _$setDispose() {
        this.state.disposed = true;
        return this;
    }

    /**@internal */
    _applyTransition(transition: ITransition): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.chain(new ImageAction<"image:applyTransition">(
            this.chain(),
            "image:applyTransition",
            new ContentNode<[ITransition]>().setContent([
                transition
            ])
        ));
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
        this.state = deepMerge<RichImageConfig<Tags>>({}, this.config);
    }

    /**@internal */
    toDisplayableTransform(): Transform {
        return new Transform<TransformDefinitions.ImageTransformProps>(this.state, {
            duration: 0,
        });
    }

    /**@internal */
    getTransformState(): TransformDefinitions.ImageTransformProps {
        return {
            position: this.state.position,
            scale: this.state.scale,
            rotation: this.state.rotation,
            opacity: this.state.opacity,
            display: this.state.display,
        };
    }

    /**
     * @internal
     * resolve tags, return the tags that aren't conflicting
     */
    resolveTags(
        oldTags: SelectElementFromEach<Tags>,
        newTags: SelectElementFromEach<Tags>
    ): SelectElementFromEach<Tags> {
        const tagMap: Map<string, string[]> = this.constructTagMap();
        const resultTags: Set<string> = new Set();

        const resolve = (tags: SelectElementFromEach<Tags>) => {
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
        throw new TypeError("To better understand the behavior of the image, " +
            "you cannot mix src and tags in the same image. " +
            "If you are using tags, remove the src from the image config and do not use setSrc method. " +
            "If you are using src, remove the tags from the image config and do not use setAppearance method.");
    }

    /**@internal */
    _srcNotSpecifiedError(): TypeError {
        throw new TypeError("Src not specified\nPlease provide a src or tags in the image config");
    }

    /**@internal */
    private constructTagMap(): Map<string, string[]> {
        const tagMap: Map<string, string[]> = new Map();
        for (const tags of this.config.tagDefinitions) {
            for (const tag of tags) {
                tagMap.set(tag, tags);
            }
        }
        return tagMap;
    }

    /**@internal */
    private _setSrc(
        chain: Proxied<Image, Chained<LogicAction.Actions>>,
        src: string | StaticImageData,
        transition?: IImageTransition
    ): Proxied<Image, Chained<LogicAction.Actions>> {
        if (transition) {
            const copy = transition.copy();
            copy.setSrc(Utils.srcToString(src));
            chain._transitionSrc(copy);
        }
        const action = new ImageAction<typeof ImageAction.ActionTypes.setSrc>(
            chain,
            ImageAction.ActionTypes.setSrc,
            new ContentNode<[string]>().setContent([
                typeof src === "string" ? src : Utils.staticImageDataToSrc(src)
            ])
        );
        return chain
            .chain(action)
            .chain(this._flush());
    }

    /**@internal */
    private _transitionSrc(transition: ITransition): this {
        const t = transition.copy();
        this._applyTransition(t);
        return this;
    }

    /**@internal */
    private _dispose(): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.chain(new ImageAction<typeof ImageAction.ActionTypes.dispose>(
            this.chain(),
            ImageAction.ActionTypes.dispose,
            new ContentNode()
        ));
    }
}

/**
 * @class
 * @internal
 * This class is only for internal use,
 * DO NOT USE THIS CLASS DIRECTLY
 */
export class VirtualImageProxy extends Image {
    override checkConfig(_: RichImageConfig<TagDefinition>): this {
        return this;
    }
}
