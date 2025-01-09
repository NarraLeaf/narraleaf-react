import {Sound} from "@core/elements/sound";
import {Image as GameImage, Image, TagDefinition, TagGroupDefinition} from "@core/elements/displayable/image";
import {Story, Utils} from "@core/common/core";
import {StaticImageData} from "@core/types";
import {LogicAction} from "@core/action/logicAction";
import {ImageAction} from "@core/action/actions/imageAction";
import {
    DisplayableActionTypes,
    ImageActionContentType,
    ImageActionTypes,
    SceneActionTypes
} from "@core/action/actionTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {SceneAction} from "@core/action/actions/sceneAction";
import {DisplayableAction} from "@core/action/actions/displayableAction";

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

    static getSrc(src: Src | string | Image): string | null {
        if (typeof src === "string") {
            return src;
        }
        if (src instanceof Image) {
            return GameImage.getSrcURL(src);
        }
        if (src.type === "image") {
            return GameImage.getSrcURL(src.src);
        } else if (src.type === "video") {
            return src.src;
        } else if (src.type === "audio") {
            return src.src.getSrc();
        }
        return "";
    }

    static getPreloadableSrc(story: Story, action: LogicAction.Actions): (Src & {
        activeType: "scene" | "once"
    }) | null {
        if (action.is<SceneAction<typeof SceneActionTypes["jumpTo"]>>(SceneAction, SceneActionTypes.jumpTo)) {
            const targetScene = action.contentNode.getContent()[0];
            const scene = story.getScene(targetScene, true);
            const sceneBackground = scene.state.backgroundImage;
            if (Utils.isImageURL(sceneBackground.config.src)) {
                return {
                    type: "image",
                    src: new Image({src: sceneBackground.config.src}),
                    activeType: "once"
                };
            }
        } else if (action instanceof ImageAction) {
            const imageAction = action as ImageAction;
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
                if (Image.isTagSrc(imageAction.callee) && tags.length === (imageAction.callee.config.src as TagDefinition<TagGroupDefinition>).groups.length) {
                    return {
                        type: "image",
                        src: Image.fromSrc(Image.getSrcFromTags(tags, imageAction.callee.config.src)),
                        activeType: "scene"
                    };
                }
            }
        } else if (action instanceof DisplayableAction) {
            if (action.is<DisplayableAction<typeof DisplayableActionTypes.init>>(DisplayableAction, DisplayableActionTypes.init)) {
                if (action.callee instanceof Image) {
                    if (Image.isTagSrc(action.callee)) {
                        return {
                            type: "image",
                            src: new Image({
                                src: Image.getSrcFromTags(action.callee.config.src.defaults, action.callee.config.src.resolve)
                            }),
                            activeType: "scene"
                        };
                    } else if (Image.isStaticSrc(action.callee) && Utils.isImageSrc(action.callee.state.currentSrc)) {
                        return {
                            type: "image",
                            src: new Image({src: action.callee.state.currentSrc}),
                            activeType: "scene"
                        };
                    }
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
                if (!Utils.isImageURL(arg0.state.currentSrc)) return this;
                if (this.isSrcRegistered(GameImage.getSrcURL(arg0))) return this;
            } else {
                if (this.isSrcRegistered(Utils.srcToURL(arg0["src"]))) return this;
            }
            this.src.push({
                type: "image", src:
                    Utils.isStaticImageData(arg0) ? new Image({
                        src: Utils.staticImageDataToSrc(arg0),
                    }) : new Image({
                        src: arg0.state.currentSrc as string,
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

    isSrcRegistered(src: string | Sound | Image | null): boolean {
        if (!src) return false;
        const target = src instanceof Sound ? src.getSrc() : src;
        return this.src.some(s => {
            if (s.type === SrcManager.SrcTypes.audio) {
                return target === s.src.getSrc();
            } else if (s.type === SrcManager.SrcTypes.image) {
                return target === GameImage.getSrcURL(s.src);
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

