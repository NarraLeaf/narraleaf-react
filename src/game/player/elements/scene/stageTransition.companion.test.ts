import {describe, expect, it} from "vitest";
import {StageTransitionManager, stageRetiredStyle, stageSettledStyle} from "@player/elements/scene/stageTransition";
import {Dissolve} from "@core/elements/transition/transitions/image/dissolve";
import type {Scene} from "@core/elements/scene";
import type {GameState} from "@player/gameState";

/**
 * A clip paints as part of the scene that showed it.
 *
 * It is not inside the scene's root - a clip the preloader is holding has no scene yet, and moving
 * its element into one would remount it and lose the buffer - so it is bound to the scene as a
 * companion, and everything the stage writes to the root is written to it: every frame of a stage
 * transition, the settle at the end, and the pose that parks a scene behind a call. Without that a
 * clip was the one thing on the stage a transition left at full strength over the incoming scene,
 * and the one thing a parked scene kept painting over the scene it had called.
 */

type FakeElement = HTMLElement & {style: Record<string, string>};

function element(): FakeElement {
    const attributes = new Map<string, string>();
    return {
        style: {} as Record<string, string>,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => void attributes.set(name, value),
        querySelectorAll: () => [],
    } as unknown as FakeElement;
}

function scene(id: string): Scene {
    return {getId: () => id} as unknown as Scene;
}

function manager(suspended: Set<Scene> = new Set()) {
    const gameState = {
        isSceneSuspended: (s: Scene) => suspended.has(s),
        getStory: () => ({getInversionConfig: () => ({invertX: false, invertY: false})}),
        schedule: () => () => void 0,
        logger: {debug: () => void 0, info: () => void 0, weakWarn: () => void 0},
    } as unknown as GameState;
    return new StageTransitionManager(gameState);
}

/** The properties a pose is made of, read off an element. */
function pose(el: FakeElement): Record<string, string | undefined> {
    return Object.fromEntries(Object.keys(stageSettledStyle()).map(key => [key, el.style[key]]));
}

describe("a scene's clip, bound to the scene", () => {
    it("is parked with its scene and painted again when the scene is", () => {
        const caller = scene("caller");
        const parked = new Set<Scene>();
        const m = manager(parked);
        const root = element();
        const clip = element();
        m.registerScene(caller, root);
        m.bindCompanion(caller, clip);

        parked.add(caller);
        m.syncScenePose(caller, true);
        expect(clip.style.visibility).toBe("hidden");
        expect(pose(clip)).toEqual(pose(root));

        parked.delete(caller);
        m.syncScenePose(caller, false);
        expect(clip.style.visibility).toBe("visible");
        expect(pose(clip)).toEqual(pose(root));
    });

    it("takes the pose its scene is already in when it is bound", () => {
        const caller = scene("caller");
        const m = manager(new Set([caller]));
        const root = element();
        m.registerScene(caller, root);
        expect(root.style.visibility).toBe("hidden");

        // Shown while its scene is parked, or mounted again by a load: hidden before it paints.
        const clip = element();
        m.bindCompanion(caller, clip);
        expect(clip.style.visibility).toBe("hidden");
    });

    it("is posed from the scene's flag when it mounts before the scene's root, then from the root", () => {
        const caller = scene("caller");
        const m = manager(new Set([caller]));
        const clip = element();
        m.bindCompanion(caller, clip);
        expect(pose(clip)).toEqual(stageRetiredStyle());

        const root = element();
        m.registerScene(caller, root);
        expect(pose(clip)).toEqual(pose(root));
    });

    it("answers to nothing but itself once unbound", () => {
        const caller = scene("caller");
        const m = manager(new Set([caller]));
        const root = element();
        const clip = element();
        m.registerScene(caller, root);
        const unbind = m.bindCompanion(caller, clip);
        unbind();
        expect(pose(clip)).toEqual(stageSettledStyle());

        // And a later pose of the scene no longer reaches it.
        m.syncScenePose(caller, true);
        expect(clip.style.visibility).toBe("visible");
    });

    it("is painted in its scene's half of a jump's transition, below the incoming scene", () => {
        const from = scene("from");
        const to = scene("to");
        const m = manager();
        const fromRoot = element();
        const toRoot = element();
        const clip = element();
        m.registerScene(from, fromRoot);
        m.registerScene(to, toRoot);
        m.bindCompanion(from, clip);

        // The start frame is painted at once (the frames after it need an animation clock this
        // environment does not have; they and the settle go through the same writer). The clip is
        // in the outgoing half's pose and below the incoming scene, which is what lets the incoming
        // scene cover it as it covers the outgoing scene's sprites.
        m.apply(new Dissolve({duration: 300}), {from, to}, () => void 0);
        expect(pose(clip)).toEqual(pose(fromRoot));
        expect(clip.style.opacity).toBe(fromRoot.style.opacity);
        expect(Number(clip.style.zIndex)).toBeLessThan(Number(toRoot.style.zIndex));
    });

    it("keeps an overlay's own z-index through every pose, and poses the rest of it with its scene", () => {
        const from = scene("from");
        const to = scene("to");
        const parked = new Set<Scene>();
        const m = manager(parked);
        const fromRoot = element();
        const toRoot = element();
        const rain = element();
        rain.style.zIndex = "3";
        m.registerScene(from, fromRoot);
        m.registerScene(to, toRoot);
        m.bindCompanion(from, rain, {keepZIndex: true});
        expect(rain.style.zIndex).toBe("3");

        // Parked with its scene: hidden like the scene, still ordered by its own z-index.
        parked.add(from);
        m.syncScenePose(from, true);
        expect(rain.style.visibility).toBe("hidden");
        expect(rain.style.zIndex).toBe("3");
        parked.delete(from);
        m.syncScenePose(from, false);
        expect(rain.style.visibility).toBe("visible");

        // A transition's frames reach it too - its opacity follows the outgoing scene - but not its order.
        m.apply(new Dissolve({duration: 300}), {from, to}, () => void 0);
        expect(rain.style.opacity).toBe(fromRoot.style.opacity);
        expect(rain.style.zIndex).toBe("3");
    });
});
