import React, {useEffect} from "react";
import {GameState} from "@player/gameState";
import {Sound} from "@core/elements/sound";
import {SrcManager} from "@core/elements/srcManager";
import {usePreloaded} from "@player/provider/preloaded";
import {Preloaded, PreloadedSrc} from "@player/lib/Preloaded";
import {Image as GameImage} from "@core/elements/image";
import {Utils} from "@core/common/Utils";
import {Img} from "./Img";

export function Preload({
                            state,
                            srcManager
                        }: Readonly<{
    state: GameState;
    srcManager: SrcManager;
}>) {
    const {preloaded} = usePreloaded();

    useEffect(() => {
        if (typeof window === 'undefined') {
            console.warn("Window is not supported in this environment");
            return;
        }

        const currentSceneSrc = state.getLastScene()?.srcManager;
        const futureSceneSrc = state.getLastScene()?.srcManager.future || [];
        const combinedSrc = [
            ...srcManager.src,
            ...(currentSceneSrc ? currentSceneSrc.src : []),
            ...(futureSceneSrc.map(v => v.src)).flat(2),
        ];

        const src = {
            image: new Set<GameImage>(),
            audio: new Set<Sound>(),
            video: new Set<string>()
        };

        combinedSrc.forEach(srcItem => {
            if (srcItem.type === SrcManager.SrcTypes.image) {
                src.image.add(srcItem.src);
            } else if (srcItem.type === SrcManager.SrcTypes.audio) {
                src.audio.add(srcItem.src);
            } else if (srcItem.type === SrcManager.SrcTypes.video) {
                src.video.add(srcItem.src);
            }
        });

        preloaded.preloaded = preloaded.preloaded.filter(p => {
            if (p.type === SrcManager.SrcTypes.audio) {
                let has = src[p.type].has((p as PreloadedSrc<"audio">).src);
                if (!has) {
                    // downgraded check
                    has = Array.from(src[p.type]).some(s => {
                        return preloaded.getSrc(p) === preloaded.getSrc(s.config.src);
                    });
                }
                return has;
            } else if (p.type === SrcManager.SrcTypes.image) {
                return src[p.type].has((p as PreloadedSrc<"image">).src);
            }
            const preloadedSrcP = preloaded.getSrc(p);
            return src[p.type].has(preloadedSrcP);
        });

        const newImages: HTMLImageElement[] = [];
        const promises: Promise<any>[] = [];
        src.image.forEach((src: GameImage) => {
            let resolve: () => void;

            const htmlImg = new Image();
            htmlImg.src = Utils.srcToString(src.state.src);
            newImages.push(htmlImg);

            const img = (<Img image={src} state={state} onLoad={() => {
                resolve();
                console.info("[Preload] Image loaded", src); // @debug
            }}/>);
            preloaded.add({type: "image", src, preloaded: img});
        });

        Promise.all(promises).then(() => {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
        });

        src.audio.forEach((src: Sound) => {
            if (!src.$getHowl()) {
                src.$setHowl(new (state.getHowl())({
                    src: src.config.src,
                    loop: src.config.loop,
                    volume: src.config.volume,
                    autoplay: false,
                    preload: true,
                }));
            }
        });

        console.log("[Preload] Preloaded", preloaded.preloaded, src.image); // @debug
        preloaded.events.emit(Preloaded.EventTypes["event:preloaded.mount"]);

        // @todo: better src manager, smart preload
        // maybe video preload here

        return () => {
            newImages.forEach(img => {
                img.onload = null;
            });
        };
    }, [state]);

    return null;
}
