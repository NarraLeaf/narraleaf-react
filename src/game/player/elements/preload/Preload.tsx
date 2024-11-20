import {useEffect} from "react";
import {GameState} from "@player/gameState";
import {SrcManager} from "@core/action/srcManager";
import {usePreloaded} from "@player/provider/preloaded";
import {Preloaded} from "@player/lib/Preloaded";
import {PreloadedToken} from "@player/lib/ImageCacheManager";
import {TaskPool} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";

export function Preload(
    {
        state,
    }: Readonly<{
        state: GameState;
    }>) {
    const {preloaded, cacheManager} = usePreloaded();
    const lastScene = state.getLastScene();
    const LogTag = "Preload";
    const {game} = useGame();

    /**
     * preload logic 2.0
     *
     * Fetch the images and store them as base64 in the stack
     */
    useEffect(() => {
        if (typeof fetch === "undefined") {
            state.logger.warn(LogTag, "Fetch is not supported in this environment, skipping preload");
            return;
        }

        const timeStart = performance.now();
        const sceneSrc = SrcManager.catSrc([
            ...(lastScene?.srcManager?.src || []),
            ...(lastScene?.srcManager?.getFutureSrc() || []),
        ]);
        const taskPool = new TaskPool(
            game.config.player.preloadConcurrency,
            game.config.player.preloadDelay,
        );
        const loadedSrc: string[] = [];
        const tokens: PreloadedToken[] = [];

        state.logger.debug(LogTag, "preloading:", sceneSrc);

        for (const image of sceneSrc.image) {
            const src = SrcManager.getSrc(image);
            loadedSrc.push(src);

            if (cacheManager.has(src)) {
                continue;
            }
            taskPool.addTask(() => new Promise(resolve => {
                const token = cacheManager.preload(src);
                token.onFinished(() => {
                    state.logger.debug(LogTag, `Image loaded (${sceneSrc.image.indexOf(image) + 1}/${sceneSrc.image.length})`, src);
                    resolve();
                    tokens.push(token);
                });
            }));
        }

        taskPool.start().then(() => {
            state.logger.debug(LogTag, "Image preload", `loaded ${cacheManager.size()} images in ${performance.now() - timeStart}ms`);

            if (game.config.player.waitForPreload) {
                preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            }
            state.events.emit(GameState.EventTypes["event:state.preload.loaded"]);
            cacheManager.filter(loadedSrc);
        });

        if (!game.config.player.waitForPreload) {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
        }
        preloaded.events.emit(Preloaded.EventTypes["event:preloaded.mount"]);

        return () => {
            for (const token of tokens) {
                token.abort();
            }

            state.events.emit(GameState.EventTypes["event:state.preload.unmount"]);
            state.logger.debug(LogTag, "Preload unmounted");
        };
    }, [lastScene]);

    return null;
}
