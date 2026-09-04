import {useEffect, useMemo, useRef} from "react";
import {GameState} from "@player/gameState";
import {usePreloaded} from "@player/provider/preloaded";
import {Preloaded} from "@player/lib/Preloaded";
import {TaskPool} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import { Scene } from "@lib/game/nlcore/elements/scene";
import { useFlush } from "../../lib/flush";
import type {
    PreloadBand,
    PreloadEntry,
    PreloadPlan,
    PreloadResource,
    PreloadStrategy,
} from "@core/preload/types";
import { createDefaultPreloadStrategy } from "./defaultStrategy";

const LogTag = "Preload";

/**
 * The preloader: it asks a {@link PreloadStrategy} what should be warm, and warms it.
 *
 * This component used to hold the policy as well - two mutually exclusive passes chosen by a config
 * flag, three hard-coded tiers in one of them, a fixed fetch-and-decode pipeline under both. All of
 * that now lives behind {@link PreloadStrategy}, and a game that supplies none gets
 * {@link createDefaultPreloadStrategy}, which is the same behaviour expressed through the same seam.
 *
 * What is left here is the part that has to be the player's: running the plan's bands at the right
 * speeds, holding the loading gate open until the band that blocks it has landed, and telling the
 * cache what to keep. The pools, the budgets, the pins and the events are unchanged.
 */
/**@internal */
export function Preload(
    {
        state,
    }: Readonly<{
        state: GameState;
    }>) {
    const {preloaded, cacheManager} = usePreloaded();
    const game = useGame();
    const [flush] = useFlush();
    /** Bands whose entries this mount has already warmed, so a re-ask does not re-enqueue them. */
    const settled = useRef<Set<string>>(new Set());

    const lastScene: Scene | null = state.getLastScene() || state.getPreloadingScene();
    const actionId: string | null = game.getLiveGame().getCurrentActionId();
    const story = game.getLiveGame().story;

    /**
     * The host's strategy, or the built-in one - decided once per game rather than per render, so a
     * strategy may keep state (the built-in one keeps the prediction window's scene-scoped set).
     */
    const strategy: PreloadStrategy = useMemo(
        () => game.config.preload ?? createDefaultPreloadStrategy(game),
        [game],
    );

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
     * Hand the cache the host's transport, and the host its missing-resource reports.
     *
     * Both before anything is warmed, and both cleared on unmount: a cache that outlived a player
     * would otherwise keep calling into a strategy that belongs to a game that is gone.
     */
    useEffect(() => {
        cacheManager.useAcquisition(strategy.acquire ? strategy.acquire.bind(strategy) : null);
        cacheManager.useMissingReporter(strategy.onMissing ? strategy.onMissing.bind(strategy) : null);
        return () => {
            cacheManager.useAcquisition(null);
            cacheManager.useMissingReporter(null);
        };
    }, [strategy, cacheManager]);

    /**
     * A scene is about to paint. Ask, then warm.
     *
     * The gate - `event:preloaded.complete`, which is the first painted frame - is held for the
     * plan's `gate` band and nothing else. A plan with an empty one opens it immediately, which is
     * how a strategy says "do not hold the screen for me".
     */
    useEffect(() => {
        if (!story || !lastScene) {
            if (!story) {
                state.logger.weakWarn(LogTag, "Story not found, skipping preload");
            } else {
                state.logger.debug(LogTag, "Scene not ready yet, waiting for scene before preload");
            }
            return onPreloaderUnmount;
        }
        // Nothing to fetch with and nobody else to ask: on a server render there is no warming to
        // do and no frame to hold, so the gate opens and the pass never starts.
        if (typeof fetch === "undefined" && !strategy.acquire) {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.complete"]);
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            state.logger.warn(LogTag, "Fetch is not supported in this environment, skipping preload");
            return onPreloaderUnmount;
        }
        if (game.config.forceClearCache) {
            cacheManager.clear();
            state.logger.weakWarn(LogTag, "Cache cleared");
        }
        settled.current.clear();

        const cancelled = {value: false};
        void runMoment({kind: "scene", scene: lastScene, story}, {gates: true, cancelled});

        preloaded.events.emit(Preloaded.EventTypes["event:preloaded.mount"]);
        return () => {
            cancelled.value = true;
            onPreloaderUnmount();
        };
    }, [lastScene, story, strategy]);

    /**
     * The story advanced. Ask again, but never hold the screen for the answer: by this point the
     * game is running, and a strategy that plans row by row is refining a warm set rather than
     * deciding whether anything can be shown at all.
     */
    useEffect(() => {
        if (!story) {
            return;
        }
        const cancelled = {value: false};
        void runMoment(
            {kind: "advance", actionId, scene: lastScene, story},
            {gates: false, cancelled},
        );
        return () => {
            cancelled.value = true;
        };
    }, [actionId, story, strategy]);

    return null;

    /** Ask the strategy about one moment and carry out whatever it answers. */
    async function runMoment(
        moment: Parameters<PreloadStrategy["plan"]>[0],
        options: {gates: boolean; cancelled: {value: boolean}},
    ): Promise<void> {
        const openGate = () => {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.complete"]);
            if (game.config.waitForPreload) {
                preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
            }
        };
        // A game that does not wait is told the moment the pass is under way, whatever it finds.
        if (options.gates && !game.config.waitForPreload) {
            preloaded.events.emit(Preloaded.EventTypes["event:preloaded.ready"]);
        }

        let plan: PreloadPlan | null;
        try {
            plan = await strategy.plan(moment);
        } catch (reason) {
            state.logger.weakError(LogTag, "Preload strategy failed to plan; nothing warmed", reason);
            if (options.gates) {
                openGate();
            }
            return;
        }
        if (options.cancelled.value) {
            return;
        }
        if (!plan) {
            // No plan is a complete answer: it means "leave what is warm alone". It must still open
            // the gate, or a game whose strategy declines the opening scene never paints.
            if (options.gates) {
                openGate();
            }
            return;
        }

        // What this moment keeps is settled now, not once its idle pool has landed: the frame about
        // to paint is pinned against the budgets, and everything outside the plan is let go - at
        // once if nothing on stage shows it, and the moment the scene that was showing it unmounts
        // otherwise. Deciding it at the end of the pass meant a left scene's artwork outlived it by
        // a whole pass, and for ever when the pass was superseded before it got there.
        if (plan.pin) {
            cacheManager.pin(plan.pin);
        }
        if (plan.keep) {
            cacheManager.retain(plan.keep);
        }
        if (plan.audio) {
            // Started now and never waited for. A scene whose music is still being fetched when it
            // opens stutters into its own first line, but the audio context may be locked behind a
            // user gesture, so nothing may block on it.
            state.audioManager.retainOnly([...plan.audio]);
        }

        await warm(plan, options, openGate);
    }

    /**
     * Run a plan's three bands.
     *
     * Neither of the first two is paced: `preloadDelay` exists to keep speculative work from
     * saturating the network, not to throttle assets the player is either waiting on or one click
     * away from.
     */
    async function warm(
        plan: PreloadPlan,
        options: {gates: boolean; cancelled: {value: boolean}},
        openGate: () => void,
    ): Promise<void> {
        const timeStart = performance.now();
        const pools: Record<PreloadBand, TaskPool> = {
            gate: new TaskPool(game.config.preloadConcurrency, 0),
            soon: new TaskPool(game.config.preloadConcurrency, 0),
            idle: new TaskPool(game.config.preloadConcurrency, game.config.preloadDelay),
        };
        const logGroup = state.logger.group(LogTag, true);
        state.logger.debug(LogTag, "preloading:", plan);

        let queued = 0;
        for (const entry of plan.entries) {
            if (enqueue(pools[entry.band], entry)) {
                queued += 1;
            }
        }
        logGroup.end();

        const describe = () => {
            const stats = cacheManager.getStats();
            const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
            return `${queued} queued in ${(performance.now() - timeStart).toFixed(0)}ms`
                + ` (${mb(stats.blobBytes)} MB fetched, ${mb(stats.decodedBytes)} MB decoded, ${stats.pinned} pinned)`;
        };

        await pools.gate.start();
        if (options.gates) {
            state.logger.info(LogTag, "Preload (gate)", describe());
            openGate();
        }
        // A superseded pass must not keep fetching for a moment that is gone. What the cache keeps
        // was settled when the pass started, so there is nothing here for a stale pass to undo.
        if (options.cancelled.value) {
            return;
        }
        await pools.soon.start();
        if (options.cancelled.value) {
            return;
        }
        await pools.idle.start();
        if (!options.cancelled.value) {
            state.logger.info(LogTag, "Preload (settled)", describe());
        }
    }

    /** Queue one entry, unless it is already warm enough for what its band asks. Reports whether it queued. */
    function enqueue(pool: TaskPool, entry: PreloadEntry): boolean {
        const key = `${entry.band}:${entry.src}`;
        if (settled.current.has(key)) {
            return false;
        }
        settled.current.add(key);
        if (entry.type === "video") {
            return enqueueVideo(pool, entry);
        }
        const retainDecoded = entry.decode ?? entry.band !== "idle";
        // Warm enough for this band: the bytes are held, and the bitmap too when the band keeps
        // one. A url another pass is still fetching is queued regardless - its token follows that
        // fetch, and a gated frame has to wait for it either way.
        if (cacheManager.has(entry.src) && (!retainDecoded || cacheManager.isDecoded(entry.src))) {
            state.logger.debug(LogTag, `Already warm (${entry.band})`, entry.src);
            return false;
        }
        pool.addTask(() => new Promise<void>(resolve => {
            cacheManager.preload(state, entry.src, {retainDecoded, decode: retainDecoded})
                .onFinished(() => {
                    state.logger.debug(LogTag, `Warmed (${entry.band})`, entry.src);
                    resolve();
                })
                .onErrored(() => {
                    state.logger.weakError(LogTag, `Failed to warm (${entry.band})`, entry.src);
                    resolve();
                });
        }));
        return true;
    }

    /**
     * Warm a video, which is a different thing from warming an image and worth saying plainly.
     *
     * There is no video cache to fill: an element plays from the network or from whatever the
     * transport caches, and the player holds no decoded frames. So all this can do is ask the host
     * for the clip - which is the whole point when the host is the one that knows how - and, with
     * no host to ask, read the bytes once so that a transport with a cache has them. What it cannot
     * do is promise that they were kept; `Video.preload()`, which mounts a hidden element and lets
     * the browser buffer into it, remains the guaranteed way and is a story action rather than a
     * plan entry.
     */
    function enqueueVideo(pool: TaskPool, entry: PreloadEntry): boolean {
        const acquire = strategy.acquire;
        if (!acquire && typeof fetch === "undefined") {
            return false;
        }
        const resource: PreloadResource = {type: "video", src: entry.src};
        pool.addTask(async () => {
            const controller = new AbortController();
            try {
                if (acquire) {
                    await acquire.call(strategy, resource, controller.signal);
                } else {
                    const response = await fetch(entry.src, {signal: controller.signal});
                    // Read to the end and drop it: what is being warmed is the transport's cache,
                    // not a buffer of ours, and a body left unread warms nothing.
                    await response.arrayBuffer();
                }
                state.logger.debug(LogTag, `Warmed video (${entry.band})`, entry.src);
            } catch (reason) {
                state.logger.weakError(LogTag, `Failed to warm video (${entry.band})`, entry.src, reason);
            }
        });
        return true;
    }
}
