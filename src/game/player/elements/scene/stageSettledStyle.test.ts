import {describe, expect, it} from "vitest";
import {
    INCOMING_SCENE_BASE_STYLE,
    SCENE_BASE_STYLE,
    stageRetiredStyle,
    stageSettledStyle,
} from "@player/elements/scene/stageTransition";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Dissolve} from "@core/elements/transition/transitions/image/dissolve";
import {FadeIn} from "@core/elements/transition/transitions/image/fadeIn";
import {BlurDissolve} from "@core/elements/transition/transitions/image/blurDissolve";
import {Push} from "@core/elements/transition/transitions/image/push";
import {ThroughColor} from "@core/elements/transition/transitions/image/throughColor";
import {Reveal} from "@core/elements/transition/transitions/image/reveal";
import {RuleReveal} from "@core/elements/transition/transitions/image/ruleReveal";
import {Mask} from "@core/elements/transition/transitions/image/mask";
import {Darkness} from "@core/elements/transition/transitions/image/darkness";
import {Exposure} from "@core/elements/transition/transitions/image/exposure";
import {GameState} from "@player/gameState";

const gameState = {
    getStory: () => ({getInversionConfig: () => ({invertX: false, invertY: false})}),
} as unknown as GameState;

/**
 * Detached is how the stage driver hands a transition to a scene root: there is no image src to
 * inject, so `asPrev`/`asTarget` contribute style only.
 */
function named(transition: ImageTransition, name: string): [string, ImageTransition] {
    return [name, transition._setDetached(true)];
}

const TRANSITIONS: [string, ImageTransition][] = [
    named(new Dissolve({duration: 300}), "Dissolve"),
    named(new FadeIn({duration: 300, offset: [40, 40]}), "FadeIn"),
    named(new BlurDissolve({duration: 300}), "BlurDissolve"),
    named(new Push({duration: 300}), "Push"),
    named(new ThroughColor({duration: 300, color: "#000000"}), "ThroughColor fade"),
    named(new ThroughColor({duration: 300, color: "#000000", holdMs: 150}), "ThroughColor held"),
    named(new ThroughColor({duration: 300, pattern: Mask.wipe()}), "ThroughColor wipe"),
    named(new ThroughColor({duration: 300, pattern: Mask.blinds()}), "ThroughColor blinds"),
    named(new ThroughColor({duration: 300, pattern: Mask.iris(), inverted: true}), "ThroughColor iris"),
    named(new ThroughColor({duration: 300, pattern: Mask.clock()}), "ThroughColor clock"),
    named(new ThroughColor({duration: 300, pattern: Mask.fan(), uncover: "continue"}), "ThroughColor fan"),
    named(new ThroughColor({duration: 300, pattern: Mask.barnDoor(), uncover: "continue"}), "ThroughColor barnDoor"),
    named(new ThroughColor({duration: 300, pattern: Mask.dots({stagger: 0.5})}), "ThroughColor dots"),
    named(new Reveal({duration: 300, pattern: Mask.wipe({direction: 135})}), "Reveal wipe"),
    named(new Reveal({duration: 300, pattern: Mask.iris()}), "Reveal iris"),
    named(new Reveal({duration: 300, pattern: Mask.blinds({feather: 4})}), "Reveal blinds"),
    named(new Reveal({duration: 300, pattern: Mask.clock()}), "Reveal clock"),
    named(new Reveal({duration: 300, pattern: Mask.fan()}), "Reveal fan"),
    named(new Reveal({duration: 300, pattern: Mask.barnDoor()}), "Reveal barnDoor"),
    named(new Reveal({duration: 300, pattern: Mask.dots({stagger: 0.5})}), "Reveal dots"),
    named(new Darkness({from: 0, to: 1, duration: 300}), "Darkness"),
    named(new Darkness({from: 1, to: 0, duration: 300, holdMs: 120}), "Darkness held"),
    named(new Exposure({duration: 300}), "Exposure"),
    named(new Exposure({duration: 300, hold: 0.4}), "Exposure hold"),
    named(new Exposure({duration: 300, holdMs: 120}), "Exposure held"),
    named(new RuleReveal({duration: 300, rule: "/rules/spiral.png"}), "RuleReveal"),
    named(new RuleReveal({duration: 300, rule: "/rules/spiral.png", inverted: true}), "RuleReveal inverted"),
];

/**
 * The style properties a transition writes to a scene root, sampled across the animation rather
 * than only at its resting frame — a cancelled transition stops at an arbitrary one. Resolvers
 * with no key drive an overlay element the driver creates and then removes, so they are excluded.
 */
function scenePropsWrittenBy(transition: ImageTransition): Set<string> {
    const written = new Set<string>();
    for (const solution of transition.createTask(gameState).resolve) {
        if (typeof solution === "function") {
            continue;
        }
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
            const props = solution.resolver(progress, progress, progress);
            Object.keys(props.style ?? {}).forEach(key => written.add(key));
        }
    }
    return written;
}

describe("stage transition - a scene root's settled pose", () => {
    const settled = new Set(Object.keys(stageSettledStyle()));

    it.each(TRANSITIONS)("resets everything %s writes to a scene root", (_name, transition) => {
        const unreset = [...scenePropsWrittenBy(transition)].filter(key => !settled.has(key));

        expect(unreset).toEqual([]);
    });

    it("means 'no transition is acting on this scene'", () => {
        expect(stageSettledStyle()).toMatchObject({
            opacity: 1,
            transform: "none",
            translate: "none",
            filter: "none",
            clipPath: "none",
            maskImage: "none",
        });
    });
});

/** The resolvers are variadic over the transition's animation tuple; here they all take one number. */
function resolveAt(transition: ImageTransition, progress: number): {src?: string}[] {
    return transition.createTask(gameState).resolve.map((solution) => {
        const resolver = typeof solution === "function" ? solution : solution.resolver;
        return (resolver as (...args: number[]) => {src?: string})(progress);
    });
}

describe("stage transition - detaching a transition from its image sources", () => {
    it("contributes no src when detached", () => {
        const transition = new Dissolve({duration: 300})._setDetached(true);

        for (const props of resolveAt(transition, 0.5)) {
            expect(props).not.toHaveProperty("src");
        }
    });

    it("still carries its sources when attached to an image", () => {
        const transition = new Dissolve({duration: 300})
            ._setPrevSrc("prev.png")
            ._setTargetSrc("target.png");

        expect(resolveAt(transition, 0.5).map(props => props.src)).toEqual(["prev.png", "target.png"]);
    });
});

describe("stage transition - a scene root is never promoted to its own layer", () => {
    // A scene root covers the whole stage and its geometry is fractional (the stage is letterboxed
    // to an aspect ratio, and displayable wrappers carry half-pixel translates). Anything that
    // gives it a compositing layer of its own makes it rasterise on the device-pixel grid, and
    // tearing that layer down when the transition ends snaps the whole scene by under a pixel.
    // `will-change` is the tempting one to add back - it is what you would reach for on an element
    // about to be animated - so it is named here rather than left to be rediscovered.
    const PROMOTES = ["willChange", "contain", "backfaceVisibility", "perspective", "transform", "translate"];

    it.each([
        ["the outgoing half", SCENE_BASE_STYLE],
        ["the incoming half", INCOMING_SCENE_BASE_STYLE],
    ])("writes nothing to %s that would give it a layer", (_name, base) => {
        expect(Object.keys(base).filter(key => PROMOTES.includes(key))).toEqual([]);
    });

    it("keeps the incoming half above the outgoing one", () => {
        // Not cosmetic: document order paints a newly added scene *below*, and every transition
        // assumes the opposite - a Reveal uncovers nothing from under an opaque scene.
        expect(Number(INCOMING_SCENE_BASE_STYLE.zIndex)).toBeGreaterThan(Number(SCENE_BASE_STYLE.zIndex));
    });
});

describe("stage transition - the scene that was left stops painting", () => {
    // `scene:exit` is a separate action, so the outgoing scene outlives the transition by a moment.
    // Stacking order cannot be relied on to keep it out of sight then: settling gives the incoming
    // scene `z-index: auto` against the outgoing one's explicit `0`, the same level, and document
    // order puts the outgoing scene in front.
    it("hides it rather than leaving it to the stacking order", () => {
        expect(stageRetiredStyle().visibility).toBe("hidden");
    });

    it("is undone for a scene that is driven again", () => {
        // An undone jump can leave a retired scene mounted; a later transition has to bring it back.
        expect(SCENE_BASE_STYLE.visibility).toBe("visible");
        expect(stageSettledStyle().visibility).toBe("visible");
    });

    it("does not depend on a transition touching its outgoing half", () => {
        // Reveal is the case that exposed this: its outgoing resolver returns nothing at all, so
        // the outgoing scene ends the transition at full opacity.
        const reveal: ImageTransition = new Reveal({duration: 300, pattern: Mask.iris()})._setDetached(true);
        const outgoing = reveal.createTask(gameState).resolve
            .find((solution) => typeof solution !== "function" && solution.key === "current") as
            {resolver: (...args: number[]) => {style?: object}} | undefined;

        expect(outgoing).toBeDefined();
        expect(outgoing!.resolver(1).style).toBeUndefined();
    });
});
