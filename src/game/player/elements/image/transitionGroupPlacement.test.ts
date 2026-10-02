import {describe, expect, it} from "vitest";
import {
    GroupSize,
    stackStyle,
    transitionGroupPlacement,
    transitionGroupProps,
} from "@player/elements/image/Image";
import {assignElementProps} from "@player/lib/elementProps";
import {deepMerge} from "@lib/util/data";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Dissolve} from "@core/elements/transition/transitions/image/dissolve";
import {FadeIn} from "@core/elements/transition/transitions/image/fadeIn";
import {BlurDissolve} from "@core/elements/transition/transitions/image/blurDissolve";
import {Push} from "@core/elements/transition/transitions/image/push";
import {ThroughColor} from "@core/elements/transition/transitions/image/throughColor";
import {Reveal} from "@core/elements/transition/transitions/image/reveal";
import {Mask} from "@core/elements/transition/transitions/image/mask";
import {Darkness} from "@core/elements/transition/transitions/image/darkness";
import {ElementProp} from "@core/elements/transition/type";
import {GameState} from "@player/gameState";

const gameState = {
    getStory: () => ({getInversionConfig: () => ({invertX: false, invertY: false})}),
} as unknown as GameState;

const PREV = "https://example.test/prev.png";
const TARGET = "https://example.test/target.png";

const TRANSITIONS: [string, ImageTransition][] = ([
    ["Dissolve", new Dissolve({duration: 300})],
    ["FadeIn", new FadeIn({duration: 300, offset: [40, 40]})],
    ["BlurDissolve", new BlurDissolve({duration: 300})],
    ["Push", new Push({duration: 300})],
    ["ThroughColor", new ThroughColor({duration: 300, color: "#000000"})],
    ["Reveal wipe", new Reveal({duration: 300, pattern: Mask.wipe()})],
    ["Darkness", new Darkness({from: 0, to: 0.5, duration: 300})],
] as [string, ImageTransition][]).map(([name, transition]) => [name, transition._setPrevSrc(PREV)._setTargetSrc(TARGET)]);

const INVERSIONS: [boolean, boolean][] = [[false, false], [false, true], [true, false], [true, true]];

const BACKGROUND: GroupSize = {width: 1400, height: 787.337057728119};
const TALLER: GroupSize = {width: 1400, height: 989.1431670281996};

/** A transition's resolvers, with both sides given a source. */
function resolversOf(transition: ImageTransition) {
    return transition._setPrevSrc(PREV)._setTargetSrc(TARGET).createTask(gameState).resolve;
}

function styles(
    resolve: ReturnType<typeof resolversOf>,
    options: { layered?: boolean; darkness?: number; invertX?: boolean; invertY?: boolean; sizes: (GroupSize | undefined)[] },
) {
    return transitionGroupProps(resolve, {
        layered: options.layered ?? false,
        darkness: options.darkness ?? 0,
        invertX: options.invertX ?? false,
        invertY: options.invertY ?? true,
        sizes: options.sizes,
    }).map((props) => props.style!);
}

/** An `<img>` that records the attributes written to it, standing in for the DOM node. */
function recordingImage(src: string) {
    const attributes = new Map<string, string>([["src", src]]);
    const writes: [string, string][] = [];
    const element = {
        style: {} as Record<string, unknown>,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => {
            writes.push([name, value]);
            attributes.set(name, value);
        },
    } as unknown as HTMLImageElement;
    return {element, writes};
}

describe("image transition - the outgoing picture at the start", () => {
    // `useDisplayable` writes a group's base first and then its resolver's start frame over it, in
    // the same commit. Any `src` the base names in between makes the browser drop the decoded
    // picture, and the frame that follows is painted without it.
    it.each(TRANSITIONS)("%s never points the picture on screen at another source", (_name, transition) => {
        const task = transition.createTask(gameState);
        const bases = transitionGroupProps(task.resolve, {
            layered: false, darkness: 0, invertX: false, invertY: true, sizes: [BACKGROUND, TALLER, undefined],
        });
        const outgoing = task.resolve.findIndex((solution) => typeof solution !== "function" && solution.key === "current");
        expect(outgoing).toBeGreaterThanOrEqual(0);

        const solution = task.resolve[outgoing];
        if (typeof solution === "function") {
            throw new Error("unreachable");
        }
        const {element, writes} = recordingImage(PREV);
        assignElementProps(element, bases[outgoing]);
        const frame = solution.resolver(...(task.animations.map((animation) => animation.start) as [number]));
        assignElementProps(element, deepMerge<ElementProp<HTMLImageElement>>(bases[outgoing], frame));

        expect(writes.filter(([name]) => name === "src")).toEqual([]);
    });

    it("leaves every source to the resolvers", () => {
        for (const [, transition] of TRANSITIONS) {
            const bases = transitionGroupProps(transition.createTask(gameState).resolve, {
                layered: false, darkness: 0, invertX: false, invertY: false, sizes: [BACKGROUND, TALLER, undefined],
            });
            for (const base of bases) {
                expect(base).not.toHaveProperty("src");
            }
        }
    });
});

describe("image transition - where each group sits", () => {
    it("leaves a group the size of the box exactly where a picture at rest sits", () => {
        expect(transitionGroupPlacement(BACKGROUND, BACKGROUND, false, true)).toBeNull();
        // Two pictures that agree on paper but not in the last bits of a float are one size.
        expect(transitionGroupPlacement(BACKGROUND, {width: 1400.0000000001, height: 787.3370577281}, true, true)).toBeNull();
    });

    it.each(INVERSIONS)("anchors a group of another size on the edges the wrapper is anchored on (invertX %s, invertY %s)", (invertX, invertY) => {
        const halfX = (BACKGROUND.width - 1100) / 2;
        const halfY = (BACKGROUND.height - TALLER.height) / 2;

        expect(transitionGroupPlacement(BACKGROUND, {width: 1100, height: TALLER.height}, invertX, invertY)).toEqual({
            top: invertY ? "auto" : 0,
            bottom: invertY ? 0 : "auto",
            left: invertX ? "auto" : 0,
            right: invertX ? 0 : "auto",
            transform: `translate(${invertX ? -halfX : halfX}px, ${invertY ? -halfY : halfY}px)`,
        });
    });

    it("keeps the group that sizes the box, and a group of its size, exactly as they are at rest", () => {
        const [sizing, incoming] = styles(resolversOf(new Dissolve({duration: 300})), {
            darkness: 0.25, sizes: [BACKGROUND, BACKGROUND],
        });

        expect(sizing).toMatchObject({transform: "none", top: "auto", left: "auto", right: "auto", bottom: "auto", filter: "brightness(0.75)"});
        expect(sizing).not.toHaveProperty("maxWidth");
        // Not merely "a translate of nothing": no placement of its own at all.
        expect(incoming).toEqual(sizing);
    });

    it("places an incoming picture of another size against its own size, dimmed as it will be at rest", () => {
        const [, incoming] = styles(resolversOf(new Dissolve({duration: 300})), {
            darkness: 0.25, sizes: [BACKGROUND, TALLER],
        });

        expect(incoming).toMatchObject({
            ...transitionGroupPlacement(BACKGROUND, TALLER, false, true),
            filter: "brightness(0.75)",
            maxWidth: "none",
            maxHeight: "none",
        });
    });

    it("places a group as at rest until its picture has reported a size", () => {
        const [sizing, incoming] = styles(resolversOf(new Dissolve({duration: 300})), {sizes: [BACKGROUND, undefined]});

        expect(incoming).toEqual(sizing);
    });

    it("places the picture a transition sizes the box with, not always the incoming one", () => {
        // Darkness puts the target first: it sizes the box, and the outgoing picture is the one placed.
        const [sizing, other] = styles(resolversOf(new Darkness({from: 0, to: 0.5, duration: 300})), {
            invertY: false, sizes: [TALLER, BACKGROUND],
        });

        expect(sizing.transform).toBe("none");
        expect(other.transform).toBe(transitionGroupPlacement(TALLER, BACKGROUND, false, false)!.transform);
    });

    it("centres a transition's own element over the box, as before", () => {
        const colourFrame = styles(resolversOf(new ThroughColor({duration: 300})), {sizes: [BACKGROUND, TALLER, undefined]})[2];

        expect(colourFrame).toMatchObject({top: "50%", left: "50%", transform: "translate(-50%, -50%)"});
    });

    it("places a layered stack the same way, over the stack's resting pose", () => {
        const transition: ImageTransition = new Dissolve({duration: 300})._setPrevLayers(["a.png"])._setTargetLayers(["b.png"]);
        const resolve = transition.createTask(gameState).resolve;

        const [sizing, sameSize] = styles(resolve, {layered: true, invertX: true, sizes: [BACKGROUND, BACKGROUND]});
        expect(sizing).toEqual(stackStyle(0));
        expect(sameSize).toEqual(stackStyle(0));

        const [, otherSize] = styles(resolve, {layered: true, invertX: true, sizes: [BACKGROUND, TALLER]});
        expect(otherSize).toEqual({...stackStyle(0), ...transitionGroupPlacement(BACKGROUND, TALLER, true, true)});
    });

    it("is undone by the resting pose, for a picture and for a stack", () => {
        // Whatever the placement writes, the style a group gets once it is at rest writes back -
        // otherwise a transition that is cancelled half-way would leave the offset behind.
        const placementKeys = Object.keys(transitionGroupPlacement(BACKGROUND, TALLER, false, false)!);
        const [resting] = styles(resolversOf(new Dissolve({duration: 300})), {sizes: [BACKGROUND, TALLER]});

        expect(Object.keys(resting)).toEqual(expect.arrayContaining(placementKeys));
        expect(Object.keys(stackStyle(0))).toEqual(expect.arrayContaining(placementKeys));
    });
});

/**
 * A model of how the browser draws an image in its box, to pin why the placement is what it is.
 *
 * Lengths are device pixels on the layout grid (multiples of 1/64). The wrapper is laid out at its
 * anchor (top-anchored) or at its anchor less its size (an inverted, bottom-anchored axis); its
 * layout position is rounded onto the pixel grid and the remainder carried down into its content,
 * where the group's own layout offset joins it and is rounded in turn. Translations are added as
 * they are. The real thing is Chromium's paint-offset snapping under a wrapper that only
 * translates; the model keeps only that split.
 */
describe("image transition - a group drawn mid-transition lands where it will rest", () => {
    type Placement = { layout: (box: number, own: number) => number; translate: (box: number, own: number) => number };

    function drawn(anchor: number, box: number, inverted: boolean, own: number, placement: Placement): number {
        const wrapperLayout = inverted ? anchor - box : anchor;
        const wrapperTranslate = inverted ? box / 2 : -box / 2;
        const snapped = Math.round(wrapperLayout);
        const carried = wrapperLayout - snapped;
        return snapped + wrapperTranslate
            + Math.round(carried + placement.layout(box, own))
            + placement.translate(box, own);
    }

    /** Read `transitionGroupPlacement`'s CSS for the vertical axis, against a box and the group's own size. */
    function fromCss(inverted: boolean): Placement {
        const css = (box: number, own: number) =>
            transitionGroupPlacement({width: 100, height: box}, {width: 100, height: own}, false, inverted);
        return {
            layout: (box, own) => (css(box, own)?.bottom === 0 ? box - own : 0),
            translate: (box, own) => {
                const transform = css(box, own)?.transform as string | undefined;
                return transform ? Number(/translate\(.+?px, (.+?)px\)/.exec(transform)![1]) : 0;
            },
        };
    }

    const atRest: Placement = {layout: () => 0, translate: () => 0};
    // The two ways a group used to be centred: by layout and its own translate, or by flex.
    const centredByLayout: Placement = {layout: (box) => box / 2, translate: (_box, own) => -own / 2};
    const centredByFlex: Placement = {layout: (box, own) => (box - own) / 2, translate: () => 0};

    // Deterministic samples on the 1/64 grid: anchors around a stage, boxes and pictures of any size.
    const samples: [number, number, number][] = [];
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const onGrid = (value: number) => Math.round(value * 64) / 64;
    for (let i = 0; i < 400; i++) {
        samples.push([onGrid(100 + next() * 900), onGrid(200 + next() * 1500), onGrid(200 + next() * 1500)]);
    }

    it.each([false, true])("matches the resting position exactly (inverted %s)", (inverted) => {
        const placement = fromCss(inverted);
        for (const [anchor, box, own] of samples) {
            expect(drawn(anchor, box, inverted, own, placement)).toBe(drawn(anchor, own, inverted, own, atRest));
        }
    });

    it.each([false, true])("is not matched by centring the group (inverted %s)", (inverted) => {
        const misses = (placement: Placement) => samples.filter(([anchor, box, own]) =>
            drawn(anchor, box, inverted, own, placement) !== drawn(anchor, own, inverted, own, atRest)).length;

        expect(misses(centredByLayout)).toBeGreaterThan(0);
        expect(misses(centredByFlex)).toBeGreaterThan(0);
    });
});
