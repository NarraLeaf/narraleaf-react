import {describe, expect, it} from "vitest";
import {stackStyle} from "@player/elements/image/Image";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Dissolve} from "@core/elements/transition/transitions/image/dissolve";
import {FadeIn} from "@core/elements/transition/transitions/image/fadeIn";
import {SoftWipe} from "@core/elements/transition/transitions/image/softWipe";
import {SoftIris} from "@core/elements/transition/transitions/image/softIris";
import {Blinds} from "@core/elements/transition/transitions/image/blinds";
import {BlurDissolve} from "@core/elements/transition/transitions/image/blurDissolve";
import {Push} from "@core/elements/transition/transitions/image/push";
import {ThroughColor} from "@core/elements/transition/transitions/image/throughColor";
import {MaskTransition} from "@core/elements/transition/transitions/image/maskTransition";
import {Darkness} from "@core/elements/transition/transitions/image/darkness";
import {GameState} from "@player/gameState";

const gameState = {
    getStory: () => ({getInversionConfig: () => ({invertX: false, invertY: false})}),
} as unknown as GameState;

function named(transition: ImageTransition, name: string): [string, ImageTransition] {
    return [name, transition._setPrevLayers(["a.png"])._setTargetLayers(["b.png"])];
}

const TRANSITIONS: [string, ImageTransition][] = [
    named(new Dissolve(300), "Dissolve"),
    named(new FadeIn(300, [40, 40]), "FadeIn"),
    named(new SoftWipe({duration: 300}), "SoftWipe"),
    named(new SoftIris({duration: 300}), "SoftIris"),
    named(new Blinds({duration: 300}), "Blinds"),
    named(new BlurDissolve({duration: 300}), "BlurDissolve"),
    named(new Push({duration: 300}), "Push"),
    named(ThroughColor.fade({duration: 300, color: "#000000"}), "ThroughColor.fade"),
    named(ThroughColor.wipe({duration: 300, color: "#000000"}), "ThroughColor.wipe"),
    named(ThroughColor.blinds({duration: 300, color: "#000000"}), "ThroughColor.blinds"),
    named(ThroughColor.iris({duration: 300, color: "#000000"}), "ThroughColor.iris"),
    named(MaskTransition.circle({duration: 300}), "MaskTransition.circle"),
    named(MaskTransition.wipe({duration: 300}), "MaskTransition.wipe"),
    named(new Darkness(0, 1, 300), "Darkness"),
];

/**
 * The style properties a transition writes to a stack wrapper, sampled across the animation
 * rather than only at its resting frame — a cancelled transition stops at an arbitrary one.
 * Resolvers with no key drive the transition's own element instead of a stack, so they are
 * excluded: that element is discarded when the transition ends.
 */
function stackPropsWrittenBy(transition: ImageTransition): Set<string> {
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

describe("layered image - the stack's settled pose", () => {
    const settled = new Set(Object.keys(stackStyle(0)));

    it.each(TRANSITIONS)("resets everything %s writes to a stack", (_name, transition) => {
        const unreset = [...stackPropsWrittenBy(transition)].filter(key => !settled.has(key));

        expect(unreset).toEqual([]);
    });

    it("means 'no transition is acting on this'", () => {
        expect(stackStyle(0)).toMatchObject({
            opacity: 1,
            transform: "none",
            translate: "none",
            clipPath: "none",
            maskImage: "none",
            filter: "brightness(1)",
        });
    });

    it("keeps darkness on the stack rather than on a layer", () => {
        expect(stackStyle(0.25).filter).toBe("brightness(0.75)");
    });
});
