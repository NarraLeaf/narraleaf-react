import {describe, expect, it} from "vitest";
import {Blinds, BlurDissolve, Dissolve, FadeIn, MaskTransition, Push, SoftIris, SoftWipe, ThroughColor} from "narraleaf-react";
// Not exported from the barrel: internal, drives `image.darken(x, duration)`.
import {Darkness} from "@core/elements/transition/transitions/image/darkness";

// The resolver entries produced by asPrev/asTarget are wrapped as
// `{ resolver, key }`; a bare resolver (the through-colour overlay layer) is a
// plain function. Unwrap to the callable form for inspection.
type ResolverEntry = ((...args: number[]) => any) | { resolver: (...args: number[]) => any; key: string };
function call(entry: ResolverEntry, t: number): any {
    const fn = typeof entry === "function" ? entry : entry.resolver;
    return fn(t);
}
function keyOf(entry: ResolverEntry): string | undefined {
    return typeof entry === "function" ? undefined : entry.key;
}

// For transitions driving more than one animation channel, where `call`'s single `t` won't do.
function callWith(entry: ResolverEntry, ...args: number[]): any {
    const fn = typeof entry === "function" ? entry : entry.resolver;
    return fn(...args);
}

// The wrapped asPrev/asTarget resolvers merge the transition's prev/target src
// into their output and throw if none is set, so give both a Color src before
// invoking them. This does not affect the mask/filter styles under test.
function prepared<T>(inst: T): T {
    (inst as any)._setPrevSrc("#000000");
    (inst as any)._setTargetSrc("#000000");
    return inst;
}

// On a layered image the element a transition drives is the stack wrapper, and the stack's
// settled style (`stackStyle` in player/elements/image/Image.tsx) is re-applied on its own once
// the transition ends. Any style property a transition writes but that settled style does not
// name keeps its last animated value — normally harmless, but `cancel()` (an undo of an in-flight
// action) stops without a final frame, so a half-way value would stick forever.
//
// This pins the full set of properties that can land on a stack. Adding one here means adding a
// reset for it to `stackStyle`; if this list changes without that, the residue is back.
describe("what a transition can leave on a layered stack", () => {
    const SETTLED_POSE_MUST_RESET = [
        "clipPath",      // MaskTransition
        "filter",        // BlurDissolve, Darkness
        "maskImage",     // SoftWipe, Blinds, SoftIris
        "opacity",       // Dissolve, BlurDissolve, MaskTransition, ThroughColor, Darkness, FadeIn
        "translate",     // Push, FadeIn
        "WebkitMaskImage",
        // Inert on their own: they only take effect alongside a mask image, which is reset above.
        "maskRepeat", "maskSize", "WebkitMaskRepeat", "WebkitMaskSize",
    ].sort();

    const gameState = {getStory: () => ({getInversionConfig: () => ({invertX: false, invertY: false})})} as any;
    // `_isLayered()` drives whether the resolvers contribute a src of their own; layered ones
    // contribute style only, which is exactly the case under test.
    const layered = <T,>(inst: T): T => {
        (inst as any)._setPrevLayers(["a.png"]);
        (inst as any)._setTargetLayers(["b.png"]);
        return inst;
    };
    const everyTransition = () => [
        new Dissolve(400),
        new FadeIn(400, [30, 30]),
        new Push({duration: 400}),
        new SoftWipe({duration: 400}),
        new SoftIris({duration: 400}),
        new Blinds({duration: 400}),
        new BlurDissolve({duration: 400}),
        new Darkness(0, 0.5, 400),
        MaskTransition.circle({duration: 400}),
        ThroughColor.fade({duration: 400, color: "#000000"}),
        ThroughColor.wipe({duration: 400, color: "#000000"}),
        ThroughColor.iris({duration: 400, color: "#000000"}),
        ThroughColor.blinds({duration: 400, color: "#000000"}),
    ].map(layered);

    it("writes nothing to a stack that the settled pose does not reset", () => {
        const written = new Set<string>();
        for (const inst of everyTransition()) {
            const task = (inst as any).createTask(gameState);
            for (const entry of task.resolve as ResolverEntry[]) {
                // A bare function is ThroughColor's colour overlay: its own element, not a stack.
                if (typeof entry === "function") continue;
                for (const t of [0, 0.25, 0.5, 0.75, 1]) {
                    Object.keys(callWith(entry, t, t, t).style || {}).forEach(k => written.add(k));
                }
            }
        }
        expect([...written].sort()).toEqual(SETTLED_POSE_MUST_RESET);
    });

    it("resolves to a resting value at the end of its run", () => {
        // Guards the normal path: completing a transition must itself land on the settled pose,
        // so the reset is a safety net rather than something the happy path depends on.
        for (const inst of everyTransition()) {
            const task = (inst as any).createTask(gameState);
            const target = (task.resolve as ResolverEntry[]).find(e => keyOf(e) === "target")!;
            const style = callWith(target, 1, 0, 0).style;
            if ("opacity" in style) expect(style.opacity, inst.constructor.name).toBe(1);
            if ("translate" in style) {
                // Identity, whatever unit it is spelled in (Push travels in vw/vh, FadeIn in px).
                const axes = String(style.translate).split(" ").map(parseFloat);
                expect(axes, inst.constructor.name).toEqual([0, 0]);
            }
        }
    });
});

describe("built-in image transitions", () => {
    it("SoftWipe: one 0→1 channel, prev current + target feathered mask", () => {
        const task = prepared(new SoftWipe({duration: 400, direction: "right", feather: 15})).createTask() as any;
        expect(task.animations).toHaveLength(1);
        expect(task.animations[0]).toMatchObject({start: 0, end: 1, duration: 400});
        expect(task.resolve).toHaveLength(2);
        expect(keyOf(task.resolve[0])).toBe("current");
        expect(keyOf(task.resolve[1])).toBe("target");
        const mask = call(task.resolve[1], 0.5).style.maskImage as string;
        expect(mask).toContain("linear-gradient(to right");
        expect(mask).not.toContain("inset("); // not the hard clip-path wipe
    });

    it("SoftWipe: fully hidden at t=0 and fully revealed at t=1", () => {
        const target = prepared(new SoftWipe({duration: 400, direction: "right", feather: 12})).createTask().resolve[1] as ResolverEntry;
        expect(call(target, 1).style.maskImage).toContain("#000 100%");
        expect(call(target, 0).style.maskImage).toContain("#000 -12%");
    });

    it("Blinds: target revealed through repeating slats that widen to full pitch", () => {
        const task = prepared(new Blinds({duration: 400, orientation: "horizontal", slats: 8})).createTask() as any;
        expect(task.resolve).toHaveLength(2);
        expect(call(task.resolve[1], 0.5).style.maskImage).toContain("repeating-linear-gradient(to bottom");
        expect(call(task.resolve[1], 1).style.maskImage).toContain("#000 12.5%"); // pitch = 100/8
        expect(call(prepared(new Blinds({duration: 400, orientation: "vertical", slats: 8})).createTask().resolve[1] as ResolverEntry, 0.5).style.maskImage)
            .toContain("repeating-linear-gradient(to right");
    });

    it("SoftIris: target revealed through an expanding feathered radial mask", () => {
        const task = prepared(new SoftIris({duration: 400, center: "50% 50%", feather: 12})).createTask() as any;
        expect(task.resolve).toHaveLength(2);
        expect(call(task.resolve[1], 0.5).style.maskImage).toContain("radial-gradient(circle at 50% 50%");
        expect(call(task.resolve[1], 1).style.maskImage).toContain("#000 138%"); // r=150, r-feather=138
    });

    it("BlurDissolve: crossfades opacity while blurring out/in", () => {
        const task = prepared(new BlurDissolve({duration: 400, blur: 16})).createTask() as any;
        expect(task.resolve).toHaveLength(2);
        expect(call(task.resolve[0], 0).style).toMatchObject({opacity: 1, filter: "blur(0px)"});
        expect(call(task.resolve[0], 1).style).toMatchObject({opacity: 0, filter: "blur(16px)"});
        expect(call(task.resolve[1], 0).style).toMatchObject({opacity: 0, filter: "blur(16px)"});
        expect(call(task.resolve[1], 1).style).toMatchObject({opacity: 1, filter: "blur(0px)"});
    });

    it("Push: uses the independent `translate` property, no offset at rest", () => {
        const task = prepared(new Push({duration: 400, direction: "left"})).createTask() as any;
        expect(task.resolve).toHaveLength(2);
        expect(call(task.resolve[0], 0).style.transform).toBeUndefined();
        expect(call(task.resolve[0], 0).style.translate).toBe("0vw 0px");
        expect(call(task.resolve[0], 1).style.translate).toBe("-100vw 0px");
        expect(call(task.resolve[1], 0).style.translate).toBe("100vw 0px");
        expect(call(task.resolve[1], 1).style.translate).toBe("0vw 0px");
        expect(call(prepared(new Push({duration: 400, direction: "bottom"})).createTask().resolve[1] as ResolverEntry, 0).style.translate)
            .toBe("0px -100vh");
    });

    describe("FadeIn", () => {
        // createTask only reads the story's inversion config off the game state.
        const gameStateWith = (invertX: boolean, invertY: boolean) => ({
            getStory: () => ({getInversionConfig: () => ({invertX, invertY})}),
        }) as any;
        const fadeIn = (startPos: [number, number] = [120, -80], invertX = false, invertY = false) =>
            prepared(new FadeIn(700, startPos)).createTask(gameStateWith(invertX, invertY));

        it("one opacity channel plus an x/y offset channel, prev current + target", () => {
            const task = fadeIn() as any;
            expect(task.animations).toHaveLength(3);
            expect(task.animations[0]).toMatchObject({start: 0, end: 1, duration: 700});
            expect(task.animations[1]).toMatchObject({start: 120, end: 0});
            expect(task.animations[2]).toMatchObject({start: -80, end: 0});
            expect(task.resolve).toHaveLength(2);
            expect(keyOf(task.resolve[0])).toBe("current");
            expect(keyOf(task.resolve[1])).toBe("target");
        });

        // Writing `transform`/`left`/`top` would overwrite the driven element's base positioning.
        // On a layered image the driven element is the stack wrapper, whose settled pose carries no
        // offset of its own, so a leftover `transform` there outlives the crossfade and displaces
        // the stack for good.
        it("offsets via the independent `translate` property, never `transform` or insets", () => {
            const style = callWith(fadeIn().resolve[1] as ResolverEntry, 0, 120, -80).style;
            expect(style.translate).toBe("120px -80px");
            expect(style.transform).toBeUndefined();
            expect(style.left).toBeUndefined();
            expect(style.top).toBeUndefined();
            expect(style.right).toBeUndefined();
            expect(style.bottom).toBeUndefined();
        });

        it("travels from the start offset to the identity at rest", () => {
            const target = fadeIn().resolve[1] as ResolverEntry;
            expect(callWith(target, 0, 120, -80).style).toMatchObject({opacity: 0, translate: "120px -80px"});
            expect(callWith(target, 1, 0, 0).style).toMatchObject({opacity: 1, translate: "0px 0px"});
        });

        it("defaults to no travel at all, only the fade", () => {
            const target = fadeIn([0, 0]).resolve[1] as ResolverEntry;
            expect(callWith(target, 0, 0, 0).style.translate).toBe("0px 0px");
            expect(callWith(target, 1, 0, 0).style.translate).toBe("0px 0px");
        });

        it("negates the offset on an inverted axis, which measures from the far edge", () => {
            expect(callWith(fadeIn([120, -80], true, false).resolve[1] as ResolverEntry, 0, 120, -80).style.translate)
                .toBe("-120px -80px");
            expect(callWith(fadeIn([120, -80], false, true).resolve[1] as ResolverEntry, 0, 120, -80).style.translate)
                .toBe("120px 80px");
        });
    });

    describe("ThroughColor", () => {
        it("fade: adds a colour overlay layer that fully covers (opacity) at the hold", () => {
            const task = prepared(ThroughColor.fade({duration: 600, color: "#000000", hold: 0.4})).createTask() as any;
            expect(task.resolve).toHaveLength(3);
            expect(keyOf(task.resolve[0])).toBe("current");
            expect(keyOf(task.resolve[1])).toBe("target");
            expect(keyOf(task.resolve[2])).toBeUndefined(); // the overlay layer

            const overlay = task.resolve[2] as ResolverEntry;
            const mid = call(overlay, 0.5);
            expect(mid.src).toBeTruthy();
            expect(mid.style.backgroundColor).toBe("#000000");
            expect(mid.style.opacity).toBe(1); // fully covered at the hold
            expect(mid.style.maskImage).toBeUndefined(); // plain = no mask, just opacity
            expect(call(overlay, 0).style.opacity).toBe(0);
            expect(call(overlay, 1).style.opacity).toBe(0);
        });

        it("swaps the prev/target images under the colour at the midpoint", () => {
            const task = prepared(ThroughColor.fade({duration: 600, color: "#000000", hold: 0.4})).createTask() as any;
            expect(call(task.resolve[0], 0.2).style.opacity).toBe(1);
            expect(call(task.resolve[0], 0.8).style.opacity).toBe(0);
            expect(call(task.resolve[1], 0.2).style.opacity).toBe(0);
            expect(call(task.resolve[1], 0.8).style.opacity).toBe(1);
        });

        it("honours the hold colour and masks per factory", () => {
            expect(call(prepared(ThroughColor.fade({duration: 600, color: "#ffffff"})).createTask().resolve[2] as ResolverEntry, 0.5).style.backgroundColor).toBe("#ffffff");
            expect(call(prepared(ThroughColor.wipe({duration: 600, direction: "right", feather: 15})).createTask().resolve[2] as ResolverEntry, 0.5).style.maskImage).toContain("linear-gradient(to right");
            expect(call(prepared(ThroughColor.iris({duration: 600, center: "50% 50%"})).createTask().resolve[2] as ResolverEntry, 0.5).style.maskImage).toContain("radial-gradient(circle at 50% 50%");
            expect(call(prepared(ThroughColor.blinds({duration: 600, orientation: "vertical", slats: 6})).createTask().resolve[2] as ResolverEntry, 0.5).style.maskImage).toContain("repeating-linear-gradient(to right");
        });

        it("copy() returns an equivalent independent instance", () => {
            const original = ThroughColor.wipe({duration: 600, color: "#123456", direction: "top", feather: 20, hold: 0.25});
            const clone = original.copy();
            expect(clone).not.toBe(original);
            expect(clone).toBeInstanceOf(ThroughColor);
            const overlayAtMid = (inst: ThroughColor) => call(inst.createTask().resolve[2] as ResolverEntry, 0.5).style;
            expect(overlayAtMid(clone)).toEqual(overlayAtMid(original));
        });
    });
});
