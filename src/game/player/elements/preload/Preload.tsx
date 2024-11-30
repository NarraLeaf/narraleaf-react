import {useEffect, useRef} from "react";
import {GameState} from "@player/gameState";
import {ActiveSrc, SrcManager} from "@core/action/srcManager";
import {usePreloaded} from "@player/provider/preloaded";
import {Preloaded} from "@player/lib/Preloaded";
import {TaskPool} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";

export function Preload(
    {
        state,
    }: Readonly<{
        state: GameState;
    }>) {
    const {preloaded, cacheManager} = usePreloaded();
    const {game} = useGame();
    const cachedSrc = useRef<Set<ActiveSrc>>(new Set());

    const LogTag = "Preload";
    const lastScene = state.getLastScene();
    const currentAction = game.getLiveGame().getCurrentAction();
    const story = game.getLiveGame().story;

    /**
     * preload logic 2.0
     *
     * Fetch the images and store them as base64 in the stack
     */
    useEffect(() => {
        if (typeof fetch === "undefined") {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            state.logger.warn(LogTag, "Fetch is not supported in this environment, skipping preload");
            return;
        }
        if (!game.config.player.preloadAllImages) {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            state.logger.debug(LogTag, "Preload all images is disabled, skipping preload");
            return;
        }
        if (game.config.player.forceClearCache) {
            cacheManager.clear();
            state.logger.weakWarn(LogTag, "Cache cleared");
        }
        if (!story) {
            state.logger.weakWarn(LogTag, "Story not found, skipping preload");
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
        const logGroup = state.logger.group(LogTag, true);

        state.logger.debug(LogTag, "preloading:", sceneSrc);

        for (const image of sceneSrc.image) {
            const src = SrcManager.getSrc(image);
            loadedSrc.push(src);

            if (cacheManager.has(src) || cacheManager.isPreloading(src)) {
                state.logger.debug(LogTag, `Image already loaded (${sceneSrc.image.indexOf(image) + 1}/${sceneSrc.image.length})`, src);
                continue;
            }
            taskPool.addTask(() => new Promise(resolve => {
                cacheManager.preload(src)
                    .onFinished(() => {
                        state.logger.debug(LogTag, `Image loaded (${sceneSrc.image.indexOf(image) + 1}/${sceneSrc.image.length})`, src);
                        resolve();
                    });
            }));
        }

        logGroup.end();

        taskPool.start().then(() => {
            state.logger.info(LogTag, "Image preload", `loaded ${cacheManager.size()} images in ${performance.now() - timeStart}ms`);

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
            state.events.emit(GameState.EventTypes["event:state.preload.unmount"]);
            state.logger.debug(LogTag, "Preload unmounted");
        };
    }, [lastScene, story]);

    /**
     * Remove cached src when scenes changed
     */
    useEffect(() => {
        cachedSrc.current.clear();
    }, [lastScene]);

    /**
     * predict preload logic
     *
     * Get future src and preload them
     */
    useEffect(() => {
        if (typeof fetch === "undefined") {
            return;
        }
        if (game.config.player.preloadAllImages) {
            return;
        }
        if (!story) {
            state.logger.weakWarn(LogTag, "Story not found, skipping preload");
            return;
        }

        const timeStart = performance.now();
        const allSrc: ActiveSrc[] = game
            .getLiveGame()
            .getAllPredictableActions(story, currentAction, game.config.player.maxPreloadActions)
            .map(s => SrcManager.getPreloadableSrc(story, s))
            .filter<ActiveSrc>(function (src): src is ActiveSrc {
                return src !== null;
            });
        const sceneBasedSrc =
            allSrc.filter(function (src): src is ActiveSrc<"scene"> {
                return src?.activeType === "scene";
            });
        sceneBasedSrc.forEach(src => {
            if (cachedSrc.current.has(src)) {
                return;
            }
            cachedSrc.current.add(src);
        });

        const actionSrc = SrcManager.catSrc([
            ...cachedSrc.current,
            ...allSrc,
        ]);

        const taskPool = new TaskPool(
            game.config.player.preloadConcurrency,
            game.config.player.preloadDelay,
        );
        const preloadSrc: string[] = [];
        const logGroup = state.logger.group(LogTag);

        state.logger.debug(LogTag, "preloading:", actionSrc);

        for (const image of actionSrc.image) {
            const src = SrcManager.getSrc(image);
            preloadSrc.push(src);

            if (cacheManager.has(src) || cacheManager.isPreloading(src)) {
                state.logger.debug(LogTag, `Image already loaded (${actionSrc.image.indexOf(image) + 1}/${actionSrc.image.length})`, src);
                continue;
            }
            taskPool.addTask(() => new Promise(resolve => {
                cacheManager.preload(src)
                    .onFinished(() => {
                        state.logger.debug(LogTag, `Image loaded (${actionSrc.image.indexOf(image) + 1}/${actionSrc.image.length})`, src);
                        resolve();
                    });
            }));
        }

        logGroup.end();

        taskPool.start().then(() => {
            state.logger.info(LogTag, "Image preload (quick reload)", `loaded ${cacheManager.size()} images in ${performance.now() - timeStart}ms`);
            cacheManager.filter(preloadSrc);
        });
    }, [currentAction, story]);

    return null;
}
