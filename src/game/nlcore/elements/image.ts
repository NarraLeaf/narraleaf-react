import {CommonImage, ImagePosition, NextJSStaticImageData, StaticImageData} from "@core/types";
import {deepEqual, deepMerge, DeepPartial, EventDispatcher, getCallStack} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {Game} from "@core/game";
import {Transform} from "./transform/transform";
import {ImageAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {Utils} from "@core/common/Utils";
import React from "react";
import {Scene} from "@core/elements/scene";
import {AnimationScope} from "framer-motion";
import {ImageActionContentType} from "@core/action/actionTypes";
import {ITransition} from "@core/elements/transition/type";
import {
    CommonPosition,
    CommonPositionType,
    D2Position,
    IPosition,
    PositionUtils
} from "@core/elements/transform/position";

export type ImageConfig = {
    src: string | NextJSStaticImageData;
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
    "event:image.ready": [AnimationScope];
    "event:image.elementLoaded": [];
    "event:image.setTransition": [ITransition | null];
};

export class Image extends Actionable<ImageDataRaw> {
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
    }
    static defaultConfig: ImageConfig = {
        src: "",
        display: false,
        position: new CommonPosition(CommonPositionType.Center),
        scale: 1,
        rotation: 0,
        opacity: 0,
    };
    static ImagePosition = ImagePosition;
    readonly name: string;
    readonly config: ImageConfig;
    state: ImageConfig;
    declare actions: ImageAction<any>[];
    events: EventDispatcher<ImageEventTypes> = new EventDispatcher();
    ref: React.RefObject<HTMLImageElement> | undefined = undefined;

    constructor(name: string, config: DeepPartial<ImageConfig>);

    constructor(config: DeepPartial<ImageConfig>);

    constructor(arg0: string | DeepPartial<ImageConfig>, config?: DeepPartial<ImageConfig>) {
        super(Actionable.IdPrefixes.Image);
        if (typeof arg0 === "string") {
            this.name = arg0;
            this.config = deepMerge<ImageConfig>(Image.defaultConfig, config || {});
        } else {
            this.name = "";
            this.config = deepMerge<ImageConfig>(Image.defaultConfig, arg0);
        }
        this.state = deepMerge<ImageConfig>({}, this.config);
        this.actions = [];

        this.checkConfig();
    }

    static serializeImageState(state: Record<string, any>): Record<string, any> {
        const handlers: Record<string, ((value: any) => any)> = {
            position: (value: IPosition) => {
                return PositionUtils.serializePosition(value);
            }
        };
        const result: Record<string, any> = {};
        for (const key in state) {
            if (state.hasOwnProperty(key)) {
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
            if (state.hasOwnProperty(key)) {
                result[key] = handlers[key] ? handlers[key](state[key]) : state[key];
            }
        }
        return result as ImageConfig;
    }

    public dispose() {
        return this._dispose();
    }

    init() {
        return this._init();
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
     * 设置图片源
     * @param src 可以是public目录下的文件
     * @param transition
     * 例如 **%root%/public/static/image.png** 在这里应该填入 **"/static/image.png"**
     */
    public setSrc(src: string | StaticImageData, transition?: ITransition): this {
        if (transition) {
            const copy = transition.copy();
            copy.setSrc(Utils.srcToString(src));
            this._transitionSrc(copy);
        }
        const action = new ImageAction<typeof ImageAction.ActionTypes.setSrc>(
            this,
            ImageAction.ActionTypes.setSrc,
            new ContentNode<[string]>(Game.getIdManager().getStringId()).setContent([
                typeof src === "string" ? src : Utils.staticImageDataToSrc(src)
            ])
        );
        this.actions.push(action);
        return this;
    }

    public applyTransform(transform: Transform): this {
        const action = new ImageAction<typeof ImageAction.ActionTypes.applyTransform>(
            this,
            ImageAction.ActionTypes.applyTransform,
            new ContentNode(Game.getIdManager().getStringId()).setContent([
                void 0,
                transform,
                getCallStack()
            ])
        );
        this.actions.push(action);
        return this
    }

    /**
     * 让图片显示，如果图片已显示，则不会有任何效果
     */
    public show(): this;

    /**
     * 让图片显示，如果图片已显示，则不会有任何效果
     *
     * 如果使用自定义Transform，需要在变换时设置opacity为1
     * @param options
     */
    public show(options: Transform): this;

    public show(options: Partial<TransformDefinitions.CommonTransformProps>): this;

    public show(options?: Transform | Partial<TransformDefinitions.CommonTransformProps>): this {
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
        this.actions.push(action);
        return this;
    }

    /**
     * 让图片隐藏，如果图片已隐藏，则不会有任何效果
     */
    public hide(): this;

    /**
     * 让图片隐藏，如果图片已隐藏，则不会有任何效果
     *
     * 如果使用自定义Transform，需要在变换时设置opacity为0
     * @param transform
     */
    public hide(transform: Transform): this;

    public hide(transform: Partial<TransformDefinitions.CommonTransformProps>): this;

    public hide(arg0?: Transform | Partial<TransformDefinitions.CommonTransformProps>): this {
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
        this.actions.push(action);
        return this;
    }

    toTransform(): Transform {
        return new Transform<TransformDefinitions.ImageTransformProps>(this.state, {
            duration: 0,
        });
    }

    toHTMLElementProps(): React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> {
        return {
            src: Utils.srcToString(this.config.src),
            width: this.state.width,
            height: this.state.height,
            style: {
                position: 'absolute',
            }
        };
    }

    setScope(scope: React.RefObject<HTMLImageElement>): this {
        this.ref = scope;
        return this;
    }

    getScope(): React.RefObject<HTMLImageElement> | undefined {
        return this.ref;
    }

    copy(): Image {
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

    _setTransition(transition: ITransition | null): this {
        this.actions.push(new ImageAction<typeof ImageAction.ActionTypes.setTransition>(
            this,
            ImageAction.ActionTypes.setTransition,
            new ContentNode<[ITransition | null]>(Game.getIdManager().getStringId()).setContent([
                transition
            ])
        ));
        return this;
    }

    _applyTransition(transition: ITransition): this {
        this.actions.push(new ImageAction<"image:applyTransition">(
            this,
            "image:applyTransition",
            new ContentNode<[ITransition]>(Game.getIdManager().getStringId()).setContent([
                transition
            ])
        ));
        return this;
    }

    private _transitionSrc(transition: ITransition): this {
        this._setTransition(transition)
            ._applyTransition(transition);
        return this;
    }

    private _dispose() {
        this.actions.push(new ImageAction<typeof ImageAction.ActionTypes.dispose>(
            this,
            ImageAction.ActionTypes.dispose,
            new ContentNode(Game.getIdManager().getStringId())
        ));
        return this;
    }

    private _init(scene?: Scene) {
        this.actions.push(new ImageAction<typeof ImageAction.ActionTypes.init>(
            this,
            ImageAction.ActionTypes.init,
            new ContentNode<[Scene?]>(Game.getIdManager().getStringId()).setContent([
                scene
            ])
        ));
        return this;
    }
}