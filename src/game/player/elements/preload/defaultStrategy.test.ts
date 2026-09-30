import { describe, expect, it, vi } from "vitest";
// The library entry point, first: `@core/action/srcManager` is part of an import cycle that only
// resolves when the graph is entered through `core`, exactly as it is at runtime. See
// `preloadPlan.test.ts`, which this file borrows its scene stand-in from.
import "@core/common/core";
import { SrcManager } from "@core/action/srcManager";
import type { Game } from "@core/game";
import type { Scene } from "@core/elements/scene";
import type { Story } from "@core/elements/story";
import type { PreloadEntry, PreloadPlan } from "@core/preload/types";
import { createDefaultPreloadStrategy } from "./defaultStrategy";

/** A scene stands in for its src manager and its opening background; nothing else is read. */
function sceneWith(own: string[], reachable: string[][], background?: string): Scene {
    const srcManager = new SrcManager();
    own.forEach(src => srcManager.registerRawSrc(src));
    reachable.forEach(group => {
        const future = new SrcManager();
        group.forEach(src => future.registerRawSrc(src));
        srcManager.registerFuture(future);
    });
    const state = background
        ? { backgroundImage: { state: { currentSrc: background } } }
        : undefined;
    return { srcManager, state } as unknown as Scene;
}

type Config = { preloadAllImages?: boolean; preloadGate?: "firstFrame" | "scene"; maxPreloadActions?: number };

function gameWith(config: Config = {}, predicted: unknown[] = []): Game {
    return {
        config: {
            preloadAllImages: config.preloadAllImages ?? true,
            preloadGate: config.preloadGate ?? "firstFrame",
            maxPreloadActions: config.maxPreloadActions ?? 10,
        },
        getLiveGame: () => ({
            stackModel: null,
            getAllPredictableActions: vi.fn(() => predicted),
        }),
    } as unknown as Game;
}

const story = {} as Story;

/** The bands a plan puts each source in, which is the whole of what a plan says about urgency. */
function bandsOf(plan: PreloadPlan | null): Record<string, PreloadEntry["band"]> {
    const bands: Record<string, PreloadEntry["band"]> = {};
    for (const entry of plan?.entries ?? []) {
        bands[entry.src] = entry.band;
    }
    return bands;
}

describe("the built-in preload strategy", () => {
    describe("planning a whole scene", () => {
        const scene = sceneWith(["bg.png", "yuko.png"], [["next-bg.png"]], "bg.png");

        it("gates on the opening frame and leaves the rest of the scene unblocking", () => {
            const plan = createDefaultPreloadStrategy(gameWith())
                .plan({ kind: "scene", scene, story }) as PreloadPlan;

            expect(bandsOf(plan)).toEqual({
                "bg.png": "gate",
                "yuko.png": "soon",
                "next-bg.png": "idle",
            });
        });

        it("puts the scene's whole registered set on the gate when the game asked it to", () => {
            const plan = createDefaultPreloadStrategy(gameWith({ preloadGate: "scene" }))
                .plan({ kind: "scene", scene, story }) as PreloadPlan;

            expect(bandsOf(plan)).toEqual({
                "bg.png": "gate",
                "yuko.png": "gate",
                "next-bg.png": "idle",
            });
        });

        it("keeps the plan and pins the opening frame", () => {
            const plan = createDefaultPreloadStrategy(gameWith())
                .plan({ kind: "scene", scene, story }) as PreloadPlan;

            expect(plan.keep).toEqual(["bg.png", "yuko.png", "next-bg.png"]);
            expect(plan.pin).toEqual(["bg.png"]);
        });

        it("does not decode the look-ahead, which is the half of warming nothing was reading", () => {
            const plan = createDefaultPreloadStrategy(gameWith())
                .plan({ kind: "scene", scene, story }) as PreloadPlan;
            const decode = Object.fromEntries((plan.entries).map(entry => [entry.src, entry.decode]));

            expect(decode).toEqual({ "bg.png": true, "yuko.png": true, "next-bg.png": false });
        });

        it("has nothing to say when the story merely advanced", () => {
            const strategy = createDefaultPreloadStrategy(gameWith());

            expect(strategy.plan({ kind: "advance", actionId: "a-1", scene, story })).toBeNull();
        });
    });

    describe("planning a window of actions instead", () => {
        const scene = sceneWith(["bg.png"], [], "bg.png");

        it("declines to plan a scene at all, so nothing holds the first frame", () => {
            const strategy = createDefaultPreloadStrategy(gameWith({ preloadAllImages: false }));

            expect(strategy.plan({ kind: "scene", scene, story })).toBeNull();
        });

        it("warms what the window predicts, paced and decoded", () => {
            const game = gameWith({ preloadAllImages: false }, [{}, {}]);
            vi.spyOn(SrcManager, "getPreloadableSrc")
                .mockReturnValueOnce({ type: "image", src: "soon.png", activeType: "scene" })
                .mockReturnValueOnce({ type: "image", src: "later.png", activeType: "once" });

            const plan = createDefaultPreloadStrategy(game)
                .plan({ kind: "advance", actionId: "a-1", scene, story }) as PreloadPlan;

            expect(plan.entries).toEqual([
                { type: "image", src: "soon.png", band: "idle", decode: true },
                { type: "image", src: "later.png", band: "idle", decode: true },
            ]);
            expect(plan.keep).toEqual(["soon.png", "later.png"]);
            vi.restoreAllMocks();
        });

        it("holds a scene-scoped source after the window has moved past it", () => {
            const game = gameWith({ preloadAllImages: false }, [{}]);
            const strategy = createDefaultPreloadStrategy(game);
            const spy = vi.spyOn(SrcManager, "getPreloadableSrc")
                .mockReturnValue({ type: "image", src: "held.png", activeType: "scene" });

            strategy.plan({ kind: "advance", actionId: "a-1", scene, story });
            spy.mockReturnValue(null);
            const plan = strategy.plan({ kind: "advance", actionId: "a-2", scene, story }) as PreloadPlan;

            expect(plan.keep).toEqual(["held.png"]);
            vi.restoreAllMocks();
        });

        it("forgets the scene-scoped set when the scene changes", () => {
            const game = gameWith({ preloadAllImages: false }, [{}]);
            const strategy = createDefaultPreloadStrategy(game);
            const spy = vi.spyOn(SrcManager, "getPreloadableSrc")
                .mockReturnValue({ type: "image", src: "held.png", activeType: "scene" });

            strategy.plan({ kind: "advance", actionId: "a-1", scene, story });
            spy.mockReturnValue(null);
            const elsewhere = sceneWith(["other.png"], [], "other.png");
            const plan = strategy.plan({ kind: "advance", actionId: "a-2", scene: elsewhere, story }) as PreloadPlan;

            expect(plan.keep).toEqual([]);
            vi.restoreAllMocks();
        });
    });
});
