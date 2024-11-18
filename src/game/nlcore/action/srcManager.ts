import {Sound} from "@core/elements/sound";
import {Image as GameImage, Image} from "@core/elements/image";
import {Utils} from "@core/common/core";
import {StaticImageData} from "@core/types";

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

export class SrcManager {
    static SrcTypes: {
        [key in SrcType]: key;
    } = {
        image: "image",
        video: "video",
        audio: "audio",
    } as const;
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
                    arg0 instanceof Image ? arg0 : new Image({
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
}

