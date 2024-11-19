import React from "react";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {Utils} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {Transform} from "../transform/transform";
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
    SelectElementFromEach,
    TypeOf
} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {Control} from "@core/elements/control";
import {ImageAction} from "@core/action/actions/imageAction";
import {Displayable, DisplayableEventTypes} from "@core/elements/displayable/displayable";

export type ImageConfig = {
    display: boolean;
    /**@internal */
    disposed?: boolean;
    wearables: Image[];
    isWearable?: boolean;
    name?: string;
    /**
     * If set to false, the image won't be initialized unless you call `init` method
     */
    autoInit: boolean;
} & CommonDisplayable;

export type ImageDataRaw = {
    state: Record<string, any>;
};

export type ImageEventTypes = {
    "event:wearable.create": [Image];
} & DisplayableEventTypes;
export type TagDefinitions<T extends TagGroupDefinition | null> =
    T extends TagGroupDefinition ? {
        groups: T;
        defaults: SelectElementFromEach<T>;
    } : never;
export type TagGroupDefinition = string[][];
export type TagSrcResolver<T extends TagGroupDefinition> = (...tags: SelectElementFromEach<T>) => string;
export type RichImageUserConfig<T extends TagGroupDefinition | null> = ImageConfig & {
    /**@internal */
    currentTags?: SelectElementFromEach<T> | null;
} &
    (T extends null ?
        {
            src: string | StaticImageData;
            tag?: never;
        } : T extends TagGroupDefinition ?
            {
                src: TagSrcResolver<T>;
                tag: TagDefinitions<T>;
            }
            : never);
export type RichImageConfig<T extends TagGroupDefinition | null> = RichImageUserConfig<T> & {};
export type StaticRichConfig = RichImageUserConfig<TagGroupDefinition | null>;


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
    static defaultConfig: RichImageUserConfig<null> = {
        display: false,
        position: new CommonPosition(CommonPositionType.Center),
        scale: 1,
        rotation: 0,
        opacity: 0,
        isWearable: false,
        wearables: [],
        src: Image.DefaultImagePlaceholder,
        currentTags: null,
        autoInit: true,
    };

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
        if (typeof state.src === "string") {
            const {src} = state as RichImageConfig<null>;
            return Utils.isStaticImageData(src) ? Utils.staticImageDataToSrc(src) : src;
        }
        const {src, currentTags} = state as RichImageConfig<TagGroupDefinition>;
        if (!currentTags) {
            throw new Error("Tags not resolved\nTags must be resolved before getting the src");
        }
        return Image.getSrcFromTags(currentTags, src);
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

    /**@internal */
    readonly name: string;
    /**@internal */
    readonly config: RichImageUserConfig<Tags>;
    /**@internal */
    readonly events: EventDispatcher<ImageEventTypes> = new EventDispatcher();
    /**@internal */
    ref: React.RefObject<HTMLDivElement> | undefined = undefined;
    /**@internal */
    state: RichImageConfig<Tags>;

    constructor(config: Partial<RichImageUserConfig<Tags>> = {}, tagDefinition?: TagDefinitions<Tags>) {
        super();
        this.name = config.name || "(anonymous)";
        this.config = deepMerge<RichImageUserConfig<Tags>>(Image.defaultConfig, config, {
            tag: tagDefinition || config.tag,
            position: config.position ? PositionUtils.tryParsePosition(config.position) : new CommonPosition(CommonPositionType.Center),
            currentTags: config.tag?.defaults
                ? [...config.tag.defaults] as SelectElementFromEach<Tags>
                : null
        });

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
    checkConfig(config: RichImageUserConfig<Tags>) {
        // invalid-position error
        if (!Transform.isPosition(config.position)) {
            throw new Error("Invalid position\nPosition must be one of CommonImagePosition, Align, Coord2D");
        }
        // mixed-src error
        if (TypeOf(config.src) === TypeOf.DataTypes.string && config.tag) {
            throw this._mixedSrcError();
        }
        // src-not-specified error
        if (!config.src && !config.tag) {
            throw this._srcNotSpecifiedError();
        }
        // invalid-wearable error
        for (const wearable of config.wearables) {
            if (!wearable.config.isWearable) {
                throw this._invalidWearableError(JSON.stringify(wearable.config));
            }
        }
        // invalid-tag-group-definition error
        if (config.tag) {
            const seen: Set<string> = new Set();
            for (const tags of config.tag.groups) {
                for (const tag of tags) {
                    if (seen.has(tag)) {
                        throw this._invalidTagGroupDefinitionError();
                    }
                    seen.add(tag);
                }
            }
        }
        // conflict-tag error
        if (config.tag) {
            const tagMap: Map<string, string[]> = this.constructTagMap(config.tag.groups);
            const usedTags = new Set<string>();
            for (const tag of config.tag.defaults) {
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
     *
     * Note: using a full set of tags will help the library preload the images.
     * @chainable
     */
    public setAppearance(
        tags: Tags extends TagGroupDefinition ? FlexibleTuple<SelectElementFromEach<Tags>> : string[],
        transition?: IImageTransition
    ): Proxied<Image, Chained<LogicAction.Actions>> {
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
        return new Image<Tags>(this.config);
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
        oldTags: SelectElementFromEach<Tags> | string[],
        newTags: SelectElementFromEach<Tags> | string[]
    ): SelectElementFromEach<Tags> {
        if (!this.state.tag) {
            throw new Error("Tag not defined\nTag must be defined in the image config");
        }
        const tagMap: Map<string, string[]> = this.constructTagMap(this.state.tag.groups);
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
        throw new TypeError("To better understand the behavior of the image, " +
            "you cannot mix src and tags in the same image. " +
            "If you are using tags, remove the src from the image config and do not use setSrc method. " +
            "If you are using src, remove the tags from the image config and do not use setAppearance method.");
    }

    /**@internal */
    _invalidSrcHandlerError(): Error {
        throw new Error("Invalid src handler, " +
            "If you are using tags, config.src must be a function that resolves the src from the tags. " +
            "If you are using src, config.src must be a string or StaticImageData");
    }

    /**@internal */
    _srcNotSpecifiedError(): TypeError {
        throw new TypeError("Src not specified\nPlease provide a src or tags in the image config");
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
    override checkConfig(_: RichImageUserConfig<TagGroupDefinition>): this {
        return this;
    }
}
