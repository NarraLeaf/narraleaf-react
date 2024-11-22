import {Sound} from "@core/elements/sound";
import {Image as GameImage, Image} from "@core/elements/displayable/image";
import {Utils} from "@core/common/core";
import {StaticImageData} from "@core/types";
import {LogicAction} from "@core/action/logicAction";
import {ImageAction} from "@core/action/actions/imageAction";
import {ImageActionContentType, ImageActionTypes, SceneActionTypes} from "@core/action/actionTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {SceneAction} from "@core/action/actions/sceneAction";

export type SrcType = "image" | "video" | "audio";
export type Src = {
    type: "image";
    src: Image;
} | {
    type: "video";
    src: string;
} | {
    type: "audio";
    src: Sound;
};
export type ActiveSrc<T extends "scene" | "once" = "scene" | "once"> = Src & {
    activeType: T;
};

export class SrcManager {
    static SrcTypes: {
        [key in SrcType]: key;
    } = {
        image: "image",
        video: "video",
        audio: "audio",
    } as const;

    static catSrc(src: Src[]): {
        image: Image[];
        video: string[];
        audio: Sound[];
    } {
        const images: Set<Image> = new Set();
        const videos: Set<string> = new Set();
        const audios: Set<Sound> = new Set();

        src.forEach(({type, src}) => {
            if (type === SrcManager.SrcTypes.image) {
                images.add(src);
            } else if (type === SrcManager.SrcTypes.video) {
                videos.add(src);
            } else {
                audios.add(src);
            }
        });

        return {
            image: Array.from(images),
            video: Array.from(videos),
            audio: Array.from(audios),
        };
    }

    static getSrc(src: Src | string | Image): string {
        if (typeof src === "string") {
            return src;
        }
        if (src instanceof Image) {
            return GameImage.getSrc(src.state);
        }
        if (src.type === "image") {
            return GameImage.getSrc(src.src.state);
        } else if (src.type === "video") {
            return src.src;
        } else if (src.type === "audio") {
            return src.src.getSrc();
        }
        return "";
    }

    static getPreloadableSrc(action: LogicAction.Actions): (Src & {
        activeType: "scene" | "once"
    }) | null {
        if (action.is<SceneAction<typeof SceneActionTypes["setBackground"]>>(SceneAction, SceneActionTypes.setBackground)) {
            const content = action.contentNode.getContent()[0];
            const src = Utils.backgroundToSrc(content);
            if (src) {
                return {
                    type: "image",
                    src: new Image({src}),
                    activeType: "scene"
                };
            }
        } else if (action.is<SceneAction<typeof SceneActionTypes["jumpTo"]>>(SceneAction, SceneActionTypes.jumpTo)) {
            const scene = action.contentNode.getContent()[0];
            const sceneBackground = scene.config.background;
            if (Utils.isStaticImageData(sceneBackground) || typeof sceneBackground === "string") {
                return {
                    type: "image",
                    src: new Image({src: sceneBackground}),
                    activeType: "once"
                };
            }
        } else if (action instanceof ImageAction) {
            const imageAction = action as ImageAction;
            if (imageAction.callee.config.tag) {
                return {
                    type: "image",
                    src: new Image({
                        src: Image.getSrcFromTags(imageAction.callee.config.tag.defaults, imageAction.callee.config.src)
                    }),
                    activeType: "scene"
                };
            }
            if (action.is<ImageAction<typeof ImageActionTypes["setSrc"]>>(ImageAction, ImageActionTypes.setSrc)) {
                const content = action.contentNode.getContent()[0];
                return {
                    type: "image",
                    src: new Image({src: content}),
                    activeType: "scene"
                };
            } else if (action.type === ImageActionTypes.initWearable) {
                const image = (action.contentNode as ContentNode<ImageActionContentType[typeof ImageActionTypes["initWearable"]]>).getContent()[0];
                return {
                    type: "image",
                    src: image,
                    activeType: "scene"
                };
            } else if (action.type === ImageActionTypes.setAppearance) {
                const tags = (action.contentNode as ContentNode<ImageActionContentType[typeof ImageActionTypes["setAppearance"]]>).getContent()[0];
                if (typeof imageAction.callee.config.src !== "function") {
                    throw imageAction.callee._invalidSrcHandlerError();
                }
                if (tags.length === imageAction.callee.state.tag?.groups.length) {
                    return {
                        type: "image",
                        src: Image.fromSrc(Image.getSrcFromTags(tags, imageAction.callee.config.src)),
                        activeType: "scene"
                    };
                }
            } else if (action.type === ImageActionTypes.init) {
                const src = action.callee.config.src;
                if (typeof src === "string" || Utils.isStaticImageData(src)) {
                    return {
                        type: "image",
                        src: new Image({src}),
                        activeType: "scene"
                    };
                }
            }
        }
        return null;
    }

    src: Src[] = [];
    future: SrcManager[] = [];

    register(src: Src): this;
    register(src: Src[]): this;
    register(src: Sound): this;
    register(src: Image | StaticImageData): this;
    register(type: SrcType, src: Src["src"]): this;
    register(arg0: Src | Src[] | SrcType | Sound | Image | StaticImageData, src?: Src["src"]): this {
        if (Array.isArray(arg0)) {
            arg0.forEach(src => this.register(src));
        } else if (arg0 instanceof Sound) {
            if (this.isSrcRegistered(arg0.getSrc())) return this;
            this.src.push({type: "audio", src: arg0});
        } else if (arg0 instanceof Image || Utils.isStaticImageData(arg0)) {
            if (arg0 instanceof Image) {
                if (this.isSrcRegistered(GameImage.getSrc(arg0.state))) return this;
            } else {
                if (this.isSrcRegistered(Utils.srcToString(arg0["src"]))) return this;
            }
            this.src.push({
                type: "image", src:
                    arg0 instanceof Image ? new Image({
                        src: Image.getSrc(arg0.state),
                    }) : new Image({
                        src: Utils.staticImageDataToSrc(arg0),
                    })
            });
        } else if (typeof arg0 === "object") {
            if (this.isSrcRegistered(arg0["src"] || "")) return this;
            this.src.push(arg0);
        } else {
            if (arg0 === "audio") {
                if (this.isSrcRegistered(src || "")) return this;
                this.src.push({
                    type: arg0, src: src instanceof Sound ? src : new Sound({
                        src: (src as Sound["config"]["src"]),
                    })
                });
            } else {
                if (this.isSrcRegistered(src || "")) return this;
                this.src.push({type: arg0, src: src} as Src);
            }
        }
        return this;
    }

    isSrcRegistered(src: string | Sound | Image): boolean {
        const target = src instanceof Sound ? src.getSrc() : src;
        return this.src.some(s => {
            if (s.type === SrcManager.SrcTypes.audio) {
                return target === s.src.getSrc();
            } else if (s.type === SrcManager.SrcTypes.image) {
                return target === GameImage.getSrc(s.src.state);
            } else {
                return target === s.src;
            }
        });
    }

    getSrc(): Src[] {
        return this.src;
    }

    getSrcByType(type: SrcType): Src[] {
        return this.src.filter(src => src.type === type);
    }

    registerFuture(srcManager: SrcManager): this {
        if (this.future.includes(srcManager) || this.hasFuture(srcManager)) return this;
        this.future.push(srcManager);
        return this;
    }

    hasFuture(s: SrcManager): boolean {
        return this.future.includes(s);
    }

    getFutureSrc(): Src[] {
        return this.future.map(s => s.getSrc()).flat(2);
    }
}

