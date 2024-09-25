import React from "react";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {ImageAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import {Utils} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {Transform} from "./transform/transform";
import {CommonImage, ImagePosition, StaticImageData} from "@core/types";
import {ImageActionContentType} from "@core/action/actionTypes";
import {Game, LogicAction} from "@core/game";
import {ITransition} from "@core/elements/transition/type";
import {
    CommonPosition,
    CommonPositionType,
    D2Position,
    IPosition,
    PositionUtils
} from "@core/elements/transform/position";
import {deepEqual, deepMerge, DeepPartial, EventDispatcher, getCallStack} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";

export type ImageConfig = {
    src: string | StaticImageData;
    display: boolean;
    disposed?: boolean;
} & CommonImage;

export type ImageDataRaw = {
    state: Record<string, any>;
};

export type ImageEventTypes = {
    "event:image.show": [Transform];
    "event:image.hide": [Transform];
    "event:image.init": [];
    "event:image.applyTransform": [Transform];
    "event:image.mount": [];
    "event:image.unmount": [];
    "event:image.ready": [React.MutableRefObject<HTMLImageElement | null>];
    "event:image.elementLoaded": [];
    "event:image.setTransition": [ITransition | null];
};

export class Image extends Actionable<ImageDataRaw, Image> {
    static EventTypes: { [K in keyof ImageEventTypes]: K } = {
        "event:image.show": "event:image.show",
        "event:image.hide": "event:image.hide",
        "event:image.init": "event:image.init",
        "event:image.applyTransform": "event:image.applyTransform",
        "event:image.mount": "event:image.mount",
        "event:image.unmount": "event:image.unmount",
        "event:image.ready": "event:image.ready",
        "event:image.elementLoaded": "event:image.elementLoaded",
        "event:image.setTransition": "event:image.setTransition",
    };
    static defaultConfig: ImageConfig = {
        src: "",
        display: false,
        position: new CommonPosition(CommonPositionType.Center),
        scale: 1,
        rotation: 0,
        opacity: 0,
    };
    static ImagePosition = ImagePosition;

    static serializeImageState(state: Record<string, any>): Record<string, any> {
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

    static deserializeImageState(state: Record<string, any>): ImageConfig {
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
        return result as ImageConfig;
    }

    readonly name: string;
    readonly config: ImageConfig;
    state: ImageConfig;
    readonly events: EventDispatcher<ImageEventTypes> = new EventDispatcher();
    ref: React.RefObject<HTMLImageElement> | undefined = undefined;

    constructor(name: string, config: DeepPartial<ImageConfig>);

    constructor(config: DeepPartial<ImageConfig>);

    constructor(arg0: string | DeepPartial<ImageConfig>, config?: DeepPartial<ImageConfig>) {
        super(Actionable.IdPrefixes.Image);
        if (typeof arg0 === "string") {
            this.name = arg0;
            this.config = deepMerge<ImageConfig>(Image.defaultConfig, config || {});
            if (this.config.position) this.config.position = PositionUtils.tryParsePosition(this.config.position);
        } else {
            this.name = "";
            this.config = deepMerge<ImageConfig>(Image.defaultConfig, arg0);
            if (this.config.position) this.config.position = PositionUtils.tryParsePosition(this.config.position);
        }
        this.state = deepMerge<ImageConfig>({}, this.config);

        this.checkConfig();
    }

    public dispose() {
        return this._dispose();
    }

    init(): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.chain(this._init());
    }

    checkConfig() {
        if (!this.config.src) {
            throw new Error("Image src is required");
        }
        if (!Transform.isPosition(this.config.position)) {
            throw new Error("Invalid position\nPosition must be one of CommonImagePosition, Align, Coord2D");
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
     */
    public setSrc(src: string | StaticImageData, transition?: ITransition): Proxied<Image, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        if (transition) {
            const copy = transition.copy();
            copy.setSrc(Utils.srcToString(src));
            chain._transitionSrc(copy);
        }
        const action = new ImageAction<typeof ImageAction.ActionTypes.setSrc>(
            this,
            ImageAction.ActionTypes.setSrc,
            new ContentNode<[string]>(Game.getIdManager().getStringId()).setContent([
                typeof src === "string" ? src : Utils.staticImageDataToSrc(src)
            ])
        );
        return chain.chain(action);
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
     */
    public applyTransform(transform: Transform): Proxied<Image, Chained<LogicAction.Actions>> {
        const action = new ImageAction<typeof ImageAction.ActionTypes.applyTransform>(
            this,
            ImageAction.ActionTypes.applyTransform,
            new ContentNode(Game.getIdManager().getStringId()).setContent([
                void 0,
                transform,
                getCallStack()
            ])
        );
        return this.chain(action);
    }

    /**
     * Show the image
     *
     * if options is provided, the image will show with the provided transform options
     * @example
     * ```ts
     * image.show({
     *     duration: 1000,
     * });
     * ```
     */
    public show(): Proxied<Image, Chained<LogicAction.Actions>>;

    public show(options: Transform): Proxied<Image, Chained<LogicAction.Actions>>;

    public show(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>>;

    public show(options?: Transform | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>> {
        const trans =
            (options instanceof Transform) ? options : new Transform<TransformDefinitions.ImageTransformProps>([
                {
                    props: {
                        opacity: 1,
                    },
                    options: options || {}
                }
            ]);
        const action = new ImageAction<typeof ImageAction.ActionTypes.show>(
            this,
            ImageAction.ActionTypes.show,
            new ContentNode<ImageActionContentType["image:show"]>(Game.getIdManager().getStringId()).setContent([
                void 0,
                trans
            ])
        );
        return this.chain(action);
    }

    /**
     * Hide the image
     */
    public hide(): Proxied<Image, Chained<LogicAction.Actions>>;

    public hide(transform: Transform): Proxied<Image, Chained<LogicAction.Actions>>;

    public hide(transform: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>>;

    public hide(arg0?: Transform | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Image, Chained<LogicAction.Actions>> {
        const action = new ImageAction<typeof ImageAction.ActionTypes.hide>(
            this,
            ImageAction.ActionTypes.hide,
            new ContentNode<ImageActionContentType["image:hide"]>(Game.getIdManager().getStringId()).setContent([
                void 0,
                (arg0 instanceof Transform) ? arg0 : new Transform<TransformDefinitions.ImageTransformProps>([
                    {
                        props: {
                            opacity: 0,
                        },
                        options: arg0 || {}
                    }
                ])
            ])
        );
        return this.chain(action);
    }

    toTransform(): Transform {
        return new Transform<TransformDefinitions.ImageTransformProps>(this.state, {
            duration: 0,
        });
    }

    setScope(scope: React.RefObject<HTMLImageElement>): this {
        this.ref = scope;
        return this;
    }

    getScope(): React.RefObject<HTMLImageElement> | undefined {
        return this.ref;
    }

    public copy(): Image {
        return new Image(this.name, this.config);
    }

    public toData(): ImageDataRaw | null {
        if (this.state.disposed || deepEqual(this.state, this.config)) {
            return null;
        }

        return {
            state: deepMerge({}, Image.serializeImageState(this.state))
        };
    }

    public fromData(data: ImageDataRaw): this {
        this.state = deepMerge<ImageConfig>(this.state, Image.deserializeImageState(data.state));
        return this;
    }

    _$setDispose() {
        this.state.disposed = true;
        return this;
    }

    _setTransition(transition: ITransition | null): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.chain(new ImageAction<typeof ImageAction.ActionTypes.setTransition>(
            this,
            ImageAction.ActionTypes.setTransition,
            new ContentNode<[ITransition | null]>(Game.getIdManager().getStringId()).setContent([
                transition
            ])
        ));
    }

    _applyTransition(transition: ITransition): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.chain(new ImageAction<"image:applyTransition">(
            this,
            "image:applyTransition",
            new ContentNode<[ITransition]>(Game.getIdManager().getStringId()).setContent([
                transition
            ])
        ));
    }

    private _transitionSrc(transition: ITransition): this {
        const t = transition.copy();
        this._setTransition(t)
            ._applyTransition(t);
        return this;
    }

    private _dispose(): Proxied<Image, Chained<LogicAction.Actions>> {
        return this.chain(new ImageAction<typeof ImageAction.ActionTypes.dispose>(
            this,
            ImageAction.ActionTypes.dispose,
            new ContentNode(Game.getIdManager().getStringId())
        ));
    }

    _init(scene?: Scene): ImageAction<typeof ImageAction.ActionTypes.init> {
        return new ImageAction<typeof ImageAction.ActionTypes.init>(
            this,
            ImageAction.ActionTypes.init,
            new ContentNode<[Scene?]>(Game.getIdManager().getStringId()).setContent([
                scene
            ])
        );
    }
}