import type {Game} from "@core/game";
import type {
    PreloadEntry,
    PreloadMoment,
    PreloadPlan,
    PreloadStrategy,
} from "@core/preload/types";
import {ActiveSrc, SrcManager} from "@core/action/srcManager";
import {planScenePreload} from "./preloadPlan";

/**
 * The strategy a game gets when it supplies none: the walk and the tiers exactly as they were.
 *
 * It exists for two reasons beyond compatibility. It is the only proof that the seam is wide
 * enough - if the behaviour the player shipped for years cannot be expressed as a
 * {@link PreloadPlan}, the seam is the wrong shape. And it is what a host can fall back to for the
 * parts of a story it does not know about, since a strategy is free to call this one and merge.
 *
 * Everything it does is read off `GameConfig`, so the fields that used to steer the player directly
 * now steer this: `preloadAllImages` chooses between the two passes below, `preloadGate` decides
 * whether the scene's whole registered set blocks the first frame or only its opening background,
 * and `maxPreloadActions` sizes the prediction window.
 */
export function createDefaultPreloadStrategy(game: Game): PreloadStrategy {
    /**
     * Sources the prediction pass has seen since the current scene started.
     *
     * The window only reaches a fixed number of actions ahead, so an image named by an action the
     * window has moved past would be released and fetched again on the way back. Holding the ones
     * marked `scene` for as long as the scene lasts is what the player did with the same set, and
     * this is where that memory now lives.
     */
    let sceneScoped: ActiveSrc[] = [];
    let sceneScopedFor: unknown = null;

    return {
        plan(moment: PreloadMoment): PreloadPlan | null {
            return game.config.preloadAllImages
                ? planWholeScene(moment)
                : planPredictionWindow(moment);
        },
    };

    /**
     * The pass a game gets by default: everything the scene about to paint registers, plus a
     * look-ahead over the scenes reachable from it.
     */
    function planWholeScene(moment: PreloadMoment): PreloadPlan | null {
        if (moment.kind !== "scene") {
            return null;
        }
        const plan = planScenePreload(moment.scene);
        // `preloadGate: "scene"` is the same statement as "the registered set blocks the frame",
        // which is what a band says directly. The tiers used to encode it as which of two pools the
        // gate was hung on; one vocabulary is enough.
        const criticalBand = game.config.preloadGate === "scene" ? "gate" : "soon";
        const entries: PreloadEntry[] = [
            ...plan.firstFrame.map((src): PreloadEntry => ({type: "image", src, band: "gate", decode: true})),
            ...plan.critical.map((src): PreloadEntry => ({type: "image", src, band: criticalBand, decode: true})),
            // Not decoded. The player used to decode this tier too and throw the bitmap away
            // immediately, which is the expensive half of warming an image paid for nothing.
            ...plan.lookAhead.map((src): PreloadEntry => ({type: "image", src, band: "idle", decode: false})),
        ];
        return {
            entries,
            audio: plan.criticalAudio,
            keep: plan.all,
            pin: plan.firstFrame,
        };
    }

    /**
     * The pass a game gets when `preloadAllImages` is off: a window of actions ahead of the current
     * one, and nothing else.
     *
     * It reads the current action off the live game rather than taking it from the moment, because
     * the window is over actions and the moment only names one by id. Nothing gates on it - a game
     * that turned the scene pass off asked not to wait.
     */
    function planPredictionWindow(moment: PreloadMoment): PreloadPlan | null {
        if (moment.kind !== "advance") {
            return null;
        }
        const story = moment.story;
        if (!story) {
            return null;
        }
        if (sceneScopedFor !== moment.scene) {
            sceneScoped = [];
            sceneScopedFor = moment.scene;
        }
        const liveGame = game.getLiveGame();
        const currentAction = liveGame.stackModel?.getTopSync()?.node?.action || null;
        const predicted = liveGame
            .getAllPredictableActions(story, currentAction, game.config.maxPreloadActions)
            .map(action => SrcManager.getPreloadableSrc(story, action))
            .filter((src): src is ActiveSrc => src !== null);

        for (const src of predicted) {
            if (src.activeType === "scene" && !sceneScoped.includes(src)) {
                sceneScoped.push(src);
            }
        }

        const seen = new Set<string>();
        const entries: PreloadEntry[] = [];
        for (const image of SrcManager.catSrc([...sceneScoped, ...predicted]).image) {
            const src = SrcManager.getSrc(image);
            if (!src || seen.has(src)) {
                continue;
            }
            seen.add(src);
            // Paced, because the player never waited for this window - but decoded, because unlike
            // the look-ahead tier above it names what the next few actions are about to show, and
            // that is exactly what a decode is worth paying for.
            entries.push({type: "image", src, band: "idle", decode: true});
        }
        return {entries, keep: [...seen]};
    }
}
