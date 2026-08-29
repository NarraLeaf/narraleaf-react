import { SrcManager } from "@core/action/srcManager";
import { Utils } from "@core/common/Utils";
import type { Scene } from "@core/elements/scene";
import type { Sound } from "@core/elements/sound";

export type ScenePreloadPlan = {
    /**
     * The image the scene's own first painted frame cannot do without: its opening background.
     *
     * Split out of {@link ScenePreloadPlan.critical} because those two answer different questions.
     * "What does this scene use anywhere in it" is a whole chapter's artwork - every pose of every
     * character it shows, every background it cuts to - and on a real project that is most of the
     * library. "What is on screen when it opens" is one picture. A host that holds its loading
     * screen up until the scene is warm was holding it for the first of those; this tier is the
     * second, and it is what {@link GameConfig.preloadGate} lets a game wait on instead.
     */
    firstFrame: string[];
    /**
     * Image urls the scene that is about to paint registers directly: its own backgrounds and
     * images, plus the immediate background of any scene it jumps to, minus anything already in
     * {@link ScenePreloadPlan.firstFrame}. Fetched unpaced, because the player is a click away
     * from needing it.
     */
    critical: string[];
    /**
     * Image urls belonging to the scenes reachable from here, minus anything already in
     * {@link ScenePreloadPlan.critical}. Speculative: warmed after the critical tier, paced, and
     * nothing waits for it.
     */
    lookAhead: string[];
    /** Every url in the plan, in order — the set the cache should keep for this scene. */
    all: string[];
    /**
     * Sounds this scene registers. Warmed alongside the critical tier but never gated on: the
     * audio context can be locked until the player interacts with the page (see
     * `AudioManager.preload`), so waiting for these could wait forever.
     */
    criticalAudio: Sound[];
};

/**
 * Split a scene's registered image sources into what must be warm before the scene paints and what
 * is merely likely to be needed soon.
 *
 * The distinction matters because a scene's `srcManager` reaches transitively: `getFutureSrc()`
 * carries the whole asset set of every scene this one can jump to. Treating that as one preload
 * pass meant the first frame of a large story waited on assets from scenes the player had not
 * reached yet.
 */
export function planScenePreload(scene: Scene): ScenePreloadPlan {
    const criticalSrc = SrcManager.catSrc(scene.srcManager?.src || []);
    const lookAheadSrc = SrcManager.catSrc(scene.srcManager?.getFutureSrc() || []);

    const firstFrame: string[] = [];
    const critical: string[] = [];
    const lookAhead: string[] = [];
    const seen = new Set<string>();

    // Read off the scene rather than off `srcManager`: the manager records what the scene uses, not
    // what it opens with, and the two are only the same for a scene with one picture in it.
    const background = scene.state?.backgroundImage?.state?.currentSrc;
    if (Utils.isImageSrc(background)) {
        const src = Utils.srcToURL(background);
        if (src) {
            seen.add(src);
            firstFrame.push(src);
        }
    }

    for (const image of criticalSrc.image) {
        const src = SrcManager.getSrc(image);
        if (!src || seen.has(src)) {
            continue;
        }
        seen.add(src);
        critical.push(src);
    }
    for (const image of lookAheadSrc.image) {
        const src = SrcManager.getSrc(image);
        if (!src || seen.has(src)) {
            continue;
        }
        seen.add(src);
        lookAhead.push(src);
    }

    return {
        firstFrame,
        critical,
        lookAhead,
        all: [...firstFrame, ...critical, ...lookAhead],
        criticalAudio: criticalSrc.audio,
    };
}
