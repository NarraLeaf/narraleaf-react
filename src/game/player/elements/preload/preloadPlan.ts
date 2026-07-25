import { SrcManager } from "@core/action/srcManager";
import type { Scene } from "@core/elements/scene";
import type { Sound } from "@core/elements/sound";

export type ScenePreloadPlan = {
    /**
     * Image urls the scene that is about to paint registers directly: its own backgrounds and
     * images, plus the immediate background of any scene it jumps to. This tier is on the path to
     * the first painted frame, so it is fetched unpaced and nothing is revealed until it is warm.
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

    const critical: string[] = [];
    const lookAhead: string[] = [];
    const seen = new Set<string>();

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
        critical,
        lookAhead,
        all: [...critical, ...lookAhead],
        criticalAudio: criticalSrc.audio,
    };
}
