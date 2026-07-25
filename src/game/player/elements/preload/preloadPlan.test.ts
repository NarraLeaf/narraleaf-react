import { describe, expect, it } from "vitest";
// The library entry point, first: `@core/action/srcManager` is part of an import cycle
// (srcManager → core → player → gameState → scene → layer → displayable → srcManager) that only
// resolves when the graph is entered through `core`, exactly as it is at runtime. Importing
// srcManager (or anything that pulls it) first leaves the class undefined mid-initialisation.
import "@core/common/core";
import { SrcManager } from "@core/action/srcManager";
import type { Scene } from "@core/elements/scene";
import { Sound } from "@core/elements/sound";
import { planScenePreload } from "./preloadPlan";

/**
 * A scene stands in for its src manager only: `planScenePreload` reads nothing else, and building
 * real scene graphs here would test the compiler rather than the split.
 */
function sceneWith(own: string[], reachable: string[][]): Scene {
    const srcManager = new SrcManager();
    own.forEach(src => srcManager.registerRawSrc(src));
    reachable.forEach(group => {
        const future = new SrcManager();
        group.forEach(src => future.registerRawSrc(src));
        srcManager.registerFuture(future);
    });
    return { srcManager } as unknown as Scene;
}

describe("planScenePreload", () => {
    it("separates what the scene needs from what the scenes after it need", () => {
        const plan = planScenePreload(sceneWith(
            ["bg.png", "yuko.png"],
            [["next-bg.png"]],
        ));

        expect(plan.critical).toEqual(["bg.png", "yuko.png"]);
        expect(plan.lookAhead).toEqual(["next-bg.png"]);
    });

    it("never queues the same url twice, and prefers the critical tier", () => {
        const plan = planScenePreload(sceneWith(
            ["shared.png", "bg.png"],
            [["shared.png", "next.png"], ["bg.png"]],
        ));

        expect(plan.critical).toEqual(["shared.png", "bg.png"]);
        expect(plan.lookAhead).toEqual(["next.png"]);
        expect(plan.all).toEqual(["shared.png", "bg.png", "next.png"]);
    });

    it("keeps every url of the pass in `all` for the cache-eviction pass", () => {
        const plan = planScenePreload(sceneWith(["a.png"], [["b.png"], ["c.png"]]));

        expect(plan.all).toEqual(["a.png", "b.png", "c.png"]);
    });

    it("handles a scene with nothing to preload", () => {
        const plan = planScenePreload(sceneWith([], []));

        expect(plan).toEqual({ critical: [], lookAhead: [], all: [], criticalAudio: [] });
    });

    it("tolerates a scene without a src manager", () => {
        const plan = planScenePreload({} as unknown as Scene);

        expect(plan).toEqual({ critical: [], lookAhead: [], all: [], criticalAudio: [] });
    });

    it("carries this scene's sounds, and only this scene's", () => {
        const bgm = new Sound({ src: "bgm.mp3" });
        const laterBgm = new Sound({ src: "later.mp3" });
        const srcManager = new SrcManager();
        srcManager.register(bgm);
        const future = new SrcManager();
        future.register(laterBgm);
        srcManager.registerFuture(future);

        const plan = planScenePreload({ srcManager } as unknown as Scene);

        // Sounds never gate the first frame, and look-ahead audio is not warmed at all: it belongs
        // to a scene the player has not reached, and its own pass will pick it up.
        expect(plan.criticalAudio).toEqual([bgm]);
        expect(plan.critical).toEqual([]);
    });
});
