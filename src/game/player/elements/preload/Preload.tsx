import {useEffect, useRef} from "react";
import {GameState} from "@player/gameState";
import {Sound} from "@core/elements/sound";
import {SrcManager} from "@core/action/srcManager";
import {usePreloaded} from "@player/provider/preloaded";
import {Preloaded, PreloadedSrc} from "@player/lib/Preloaded";
import {Image as GameImage} from "@core/elements/image";

export function Preload(
    {
        state,
    }: Readonly<{
        state: GameState;
    }>) {
    const {preloaded} = usePreloaded();
    const lastScene = state.getLastScene();
    const time = useRef<number>(0);

    useEffect(() => {
        if (typeof window === "undefined") {
            console.warn("Window is not supported in this environment");
            return;
        }

        if (window.performance) {
            time.current = performance.now();
        }

        const currentSceneSrc = state.getLastScene()?.srcManager;
        const futureSceneSrc = state.getLastScene()?.srcManager.future || [];
        const combinedSrc = [
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

        state.logger.debug("Preloading", src, futureSceneSrc);

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
            const htmlImg = new Image();
            htmlImg.src = GameImage.getSrc(src.state);
            htmlImg.onload = () => {
                state.logger.debug("Image loaded", src.state.src);
            };
            newImages.push(htmlImg);

            preloaded.add({type: "image", src});
        });

        Promise.all(promises).then(() => {
            state.logger.log("Preloaded", `Preloaded ${src.image.size} images`);
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            state.events.emit(GameState.EventTypes["event:state.preload.loaded"]);

            if (window.performance) {
                const endTime = performance.now();
                const loadTime = endTime - time.current;
                state.logger.info("Preload", `Preloaded ${src.image.size} images in ${loadTime}ms`);
            }
        });

        src.audio.forEach((src: Sound) => {
            if (!src.getPlaying()) {
                src.setPlaying(new (state.getHowl())({
                    src: src.config.src,
                    loop: src.config.loop,
                    volume: src.config.volume,
                    autoplay: false,
                    preload: true,
                }));
            }
        });

        preloaded.events.emit(Preloaded.EventTypes["event:preloaded.mount"]);

        // maybe video preload here

        return () => {
            newImages.forEach(img => {
                img.onload = null;
            });
            state.events.emit(GameState.EventTypes["event:state.preload.unmount"]);
            state.logger.debug("Preload unmounted");
        };
    }, [lastScene]);

    return null;
}
