import {useEffect, useRef} from "react";
import {GameState} from "@player/gameState";
import {ActiveSrc, SrcManager} from "@core/action/srcManager";
import {usePreloaded} from "@player/provider/preloaded";
import {Preloaded} from "@player/lib/Preloaded";
import {TaskPool} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import { Scene } from "@lib/game/nlcore/elements/scene";
import { useFlush } from "../../lib/flush";
import { LogicAction } from "@lib/game/nlcore/action/logicAction";
import { planScenePreload } from "./preloadPlan";

/**@internal */
export function Preload(
    {
        state,
    }: Readonly<{
        state: GameState;
    }>) {
    const {preloaded, cacheManager} = usePreloaded();
    const game = useGame();
    const cachedSrc = useRef<Set<ActiveSrc>>(new Set());
    const [flush] = useFlush();

    const LogTag = "Preload";
    const lastScene: Scene | null = state.getLastScene() || state.getPreloadingScene();
    const currentAction: LogicAction.Actions | null = game.getLiveGame().stackModel?.getTopSync()?.node?.action || null;
    const story = game.getLiveGame().story;

    function onPreloaderUnmount() {
        state.logger.debug(LogTag, "Preload unmounted");
        preloaded.events.emit(Preloaded.EventTypes["event:preloaded.unmount"]);
    }

    useEffect(() => {
        return state.events.on(GameState.EventTypes["event:state:flushPreloadedScenes"], () => {
            flush();
        }).cancel;
    }, []);

    /**
     * preload logic 2.0
     *
     * Fetch the images and store them as base64 in the stack.
     *
     * Split into two tiers. The critical tier is what the scene that is about to paint needs
     * itself; it runs unpaced and is the only tier that gates `event:preloaded.complete`, i.e.
     * the first painted frame. The look-ahead tier is every asset the scenes reachable from here
     * need; it runs afterwards, paced by {@link GameConfig.preloadDelay}, and nothing waits for
     * it. Before this split a game could not show its first frame until every reachable scene's
     * images had been fetched, base64-encoded and decoded — seconds of latency on a large story,
     * all of it spent on assets the player was not about to see.
     */
    useEffect(() => {
        if (typeof fetch === "undefined") {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.complete"]);
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            state.logger.warn(LogTag, "Fetch is not supported in this environment, skipping preload");
            return onPreloaderUnmount;
        }
        if (!game.config.preloadAllImages) {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.complete"]);
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            state.logger.debug(LogTag, "Preload all images is disabled, skipping preload");
            return onPreloaderUnmount;
        }
        if (game.config.forceClearCache) {
            cacheManager.clear();
            state.logger.weakWarn(LogTag, "Cache cleared");
        }
        if (!story || !lastScene) {
            if (!story) {
                state.logger.weakWarn(LogTag, "Story not found, skipping preload");
            } else {
                state.logger.debug(LogTag, "Scene not ready yet, waiting for scene before preload");
            }
            return onPreloaderUnmount;
        }

        const timeStart = performance.now();
        const plan = planScenePreload(lastScene);
        // The critical tier is on the path to the first frame, so it is not paced: `preloadDelay`
        // exists to keep speculative look-ahead work from saturating the network, not to throttle
        // assets the player is already waiting on.
        const criticalPool = new TaskPool(game.config.preloadConcurrency, 0);
        const lookAheadPool = new TaskPool(
            game.config.preloadConcurrency,
            game.config.preloadDelay,
        );
        const logGroup = state.logger.group(LogTag, true);
        let cancelled = false;

        state.logger.debug(LogTag, "preloading:", plan, lastScene);

        const enqueue = (pool: TaskPool, urls: string[], tier: string, retainDecoded: boolean) => {
            urls.forEach((src, index) => {
                if (cacheManager.has(src) || cacheManager.isPreloading(src)) {
                    state.logger.debug(LogTag, `Image already loaded (${tier} ${index + 1}/${urls.length})`, src);
                    return;
                }
                pool.addTask(() => new Promise(resolve => {
                    cacheManager.preload(state, src, {retainDecoded})
                        .onFinished(() => {
                            state.logger.debug(LogTag, `Image loaded (${tier} ${index + 1}/${urls.length})`, src);
                            resolve();
                        })
                        .onErrored(() => {
                            state.logger.weakError(LogTag, `Failed to preload image (${tier} ${index + 1}/${urls.length})`, src);
                            resolve();
                        });
                }));
            });
        };

        // Only the critical tier retains its decoded bitmaps: those are the ones that must paint
        // without an asynchronous decode. Retaining the look-ahead tier's would mean holding a
        // full-resolution bitmap for every reachable scene.
        enqueue(criticalPool, plan.critical, "first scene", true);
        enqueue(lookAheadPool, plan.lookAhead, "look-ahead", false);

        logGroup.end();

        void criticalPool.start().then(async () => {
            state.logger.info(
                LogTag,
                "Image preload (first scene)",
                `loaded ${cacheManager.size()} images in ${performance.now() - timeStart}ms`,
            );

            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.complete"]);
            if (game.config.waitForPreload) {
                preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            }

            // A superseded pass must neither keep fetching for a scene that is gone nor run its
            // eviction: `filter()` keeps only this pass's src list, so a stale one would drop the
            // images the current scene just cached.
            if (cancelled) {
                return;
            }
            await lookAheadPool.start();
            if (cancelled) {
                return;
            }
            state.logger.info(
                LogTag,
                "Image preload (look-ahead)",
                `loaded ${cacheManager.size()} images in ${performance.now() - timeStart}ms`,
            );
            cacheManager.filter(plan.all);
        });

        if (!game.config.waitForPreload) {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
        }
        preloaded.events.emit(Preloaded.EventTypes["event:preloaded.mount"]);

        return () => {
            cancelled = true;
            onPreloaderUnmount();
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
        if (game.config.preloadAllImages) {
            return;
        }
        if (!story) {
            state.logger.weakWarn(LogTag, "Story not found, skipping preload");
            return;
        }

        const timeStart = performance.now();
        const allSrc: ActiveSrc[] = game
            .getLiveGame()
            .getAllPredictableActions(story, currentAction, game.config.maxPreloadActions)
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
            game.config.preloadConcurrency,
            game.config.preloadDelay,
        );
        const preloadSrc: string[] = [];
        const logGroup = state.logger.group(LogTag);

        state.logger.debug(LogTag, "preloading:", actionSrc);

        for (const image of actionSrc.image) {
            const src = SrcManager.getSrc(image);
            if (!src) {
                continue;
            }
            preloadSrc.push(src);

            if (cacheManager.has(src) || cacheManager.isPreloading(src)) {
                state.logger.debug(LogTag, `Image already loaded (${actionSrc.image.indexOf(image) + 1}/${actionSrc.image.length})`, src);
                continue;
            }
            taskPool.addTask(() => new Promise(resolve => {
                cacheManager.preload(state, src)
                    .onFinished(() => {
                        state.logger.debug(LogTag, `Image loaded (${actionSrc.image.indexOf(image) + 1}/${actionSrc.image.length})`, src);
                        resolve();
                    })
                    .onErrored(() => {
                        state.logger.weakError(LogTag, `Failed to preload image (${actionSrc.image.indexOf(image) + 1}/${actionSrc.image.length})`, src);
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
