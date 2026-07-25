import { describe, expect, it } from "vitest";
// The library entry point, first: `@core/action/srcManager` is part of an import cycle
// (srcManager → core → player → gameState → scene → layer → displayable → srcManager) that only
// resolves when the graph is entered through `core`, exactly as it is at runtime. Importing
// srcManager (or anything that pulls it) first leaves the class undefined mid-initialisation.
import "@core/common/core";
import { SrcManager } from "@core/action/srcManager";
import type { Scene } from "@core/elements/scene";
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

        expect(plan).toEqual({ critical: [], lookAhead: [], all: [] });
    });

    it("tolerates a scene without a src manager", () => {
        const plan = planScenePreload({} as unknown as Scene);

        expect(plan).toEqual({ critical: [], lookAhead: [], all: [] });
    });
});
