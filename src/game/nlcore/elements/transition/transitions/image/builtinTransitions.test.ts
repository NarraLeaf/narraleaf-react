import {describe, expect, it} from "vitest";
import {
    BlurDissolve,
    Darkness,
    Dissolve,
    Exposure,
    FadeIn,
    Mask,
    Push,
    Reveal,
    ThroughColor,
} from "narraleaf-react";

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
        "filter",        // BlurDissolve, Darkness, Exposure
        "maskImage",     // Reveal
        "opacity",       // Dissolve, BlurDissolve, ThroughColor, Darkness, Exposure, FadeIn
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
        new Dissolve({duration: 400}),
        new FadeIn({duration: 400, offset: [30, 30]}),
        new Push({duration: 400}),
        new BlurDissolve({duration: 400}),
        new Darkness({from: 0, to: 0.5, duration: 400}),
        new Exposure({duration: 400}),
        new Exposure({duration: 400, hold: 0.4}),
        new Reveal({duration: 400, pattern: Mask.wipe({direction: 135})}),
        new Reveal({duration: 400, pattern: Mask.clock()}),
        new Reveal({duration: 400, pattern: Mask.fan()}),
        new Reveal({duration: 400, pattern: Mask.barnDoor()}),
        new Reveal({duration: 400, pattern: Mask.dots({stagger: 0.5})}),
        new Reveal({duration: 400, pattern: Mask.blinds({feather: 4})}),
        new Reveal({duration: 400, pattern: Mask.iris({shape: "ellipse"})}),
        new ThroughColor({duration: 400}),
        new ThroughColor({duration: 400, pattern: Mask.wipe()}),
        new ThroughColor({duration: 400, pattern: Mask.iris(), inverted: true}),
        new ThroughColor({duration: 400, pattern: Mask.blinds()}),
        new ThroughColor({duration: 400, pattern: Mask.clock()}),
        new ThroughColor({duration: 400, pattern: Mask.fan(), uncover: "continue"}),
        new ThroughColor({duration: 400, pattern: Mask.barnDoor(), uncover: "continue"}),
        new ThroughColor({duration: 400, pattern: Mask.dots({stagger: 0.5})}),
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
                // Identity, whatever unit it is spelled in (Push travels in %, FadeIn in px).
                const axes = String(style.translate).split(" ").map(parseFloat);
                expect(axes, inst.constructor.name).toEqual([0, 0]);
            }
        }
    });
});

describe("built-in image transitions", () => {
    it("BlurDissolve: crossfades opacity while blurring out/in", () => {
        const task = prepared(new BlurDissolve({duration: 400, blur: 16})).createTask() as any;
        expect(task.resolve).toHaveLength(2);
        expect(call(task.resolve[0], 0).style).toMatchObject({opacity: 1, filter: "blur(0px)"});
        expect(call(task.resolve[0], 1).style).toMatchObject({opacity: 0, filter: "blur(16px)"});
        expect(call(task.resolve[1], 0).style).toMatchObject({opacity: 0, filter: "blur(16px)"});
        expect(call(task.resolve[1], 1).style).toMatchObject({opacity: 1, filter: "blur(0px)"});
    });

    describe("Push", () => {
        // resolve[0] = asPrev (the outgoing image, exit phase);
        // resolve[1] = asTarget (the incoming image, enter phase).
        //
        // Every travel is a percentage of the layer's *own* size, never a viewport unit. The driven
        // element is the letterboxed transition stack wrapper (`inset: 0` in Image.tsx `stackStyle`),
        // so a `vw`/`vh` travel is measured against the window and overshoots the stage whenever the
        // window aspect differs from the design aspect, exposing the backdrop mid-slide. `%` is the
        // identity at rest and lands exactly one stage width/height away at full travel.
        const cases = [
            {direction: "left", prevRest: "0% 0px", prevOff: "-100% 0px", targetOff: "100% 0px", targetRest: "0% 0px"},
            {direction: "right", prevRest: "0% 0px", prevOff: "100% 0px", targetOff: "-100% 0px", targetRest: "0% 0px"},
            {direction: "top", prevRest: "0px 0%", prevOff: "0px -100%", targetOff: "0px 100%", targetRest: "0px 0%"},
            {direction: "bottom", prevRest: "0px 0%", prevOff: "0px 100%", targetOff: "0px -100%", targetRest: "0px 0%"},
        ] as const;

        for (const c of cases) {
            it(`${c.direction}: slides both images a full % of the stage, identity at rest`, () => {
                const task = prepared(new Push({duration: 400, direction: c.direction})).createTask() as any;
                expect(task.resolve).toHaveLength(2);
                const [prev, target] = task.resolve as ResolverEntry[];
                // Uses the independent `translate` property, never `transform` (which would clobber
                // the wrapper's base positioning).
                expect(call(prev, 0).style.transform).toBeUndefined();
                // Exit: at rest (t=0) → off toward `direction` (t=1).
                expect(call(prev, 0).style.translate).toBe(c.prevRest);
                expect(call(prev, 1).style.translate).toBe(c.prevOff);
                // Enter: off the opposite edge (t=0) → at rest (t=1).
                expect(call(target, 0).style.translate).toBe(c.targetOff);
                expect(call(target, 1).style.translate).toBe(c.targetRest);
                // The unit is percentages, never viewport units — the whole point of the fix.
                expect(call(prev, 1).style.translate).not.toMatch(/vw|vh/);
                expect(call(target, 0).style.translate).not.toMatch(/vw|vh/);
            });
        }
    });

    describe("Darkness", () => {
        // Exported from the public barrel (imported above from "narraleaf-react"): the transition
        // behind `image.darken(amount, duration)`. Smoke-tests construction + the driven channel;
        // its behaviour is otherwise unchanged by the export.
        it("one brightness channel running from `from` to `to`", () => {
            const task = prepared(new Darkness({from: 0.2, to: 0.8, duration: 500})).createTask() as any;
            expect(task.animations).toHaveLength(1);
            expect(task.animations[0]).toMatchObject({start: 0.2, end: 0.8, duration: 500});
            expect(task.resolve).toHaveLength(2);
        });

        it("darkens the incoming image via a brightness() filter, dropping the outgoing one", () => {
            // resolve[0] is the target (darkened in place); resolve[1] is the prev (removed at once).
            const [target, prev] = prepared(new Darkness({from: 0, to: 1, duration: 500})).createTask().resolve as ResolverEntry[];
            expect(call(target, 0).style.filter).toBe("brightness(1)"); // darkness 0 → untouched
            expect(call(target, 1).style.filter).toBe("brightness(0)"); // darkness 1 → fully black
            expect(call(prev, 0).style.opacity).toBe(0);
        });

        it("copy() returns an equivalent independent instance", () => {
            const original = new Darkness({from: 0.1, to: 0.6, duration: 300, easing: "easeOut"});
            const clone = original.copy();
            expect(clone).not.toBe(original);
            expect(clone).toBeInstanceOf(Darkness);
            const filterAt = (inst: Darkness, d: number) =>
                call(prepared(inst).createTask().resolve[0] as ResolverEntry, d).style.filter;
            expect(filterAt(clone, 0.5)).toBe(filterAt(original, 0.5));
        });
    });

    describe("Exposure", () => {
        // The photographic counterpart to a white ThroughColor: the frame is driven up in stops
        // until every channel clips, rather than mixed toward white at one rate. What the filter
        // chain says is therefore the whole behaviour, so it is asserted verbatim.
        it("one 0→1 channel driving the two halves", () => {
            const task = prepared(new Exposure({duration: 400})).createTask() as any;
            expect(task.animations).toHaveLength(1);
            expect(task.animations[0]).toMatchObject({start: 0, end: 1, duration: 400});
            expect(task.resolve).toHaveLength(2);
        });

        it("leaves a resting frame untouched at both ends", () => {
            // Not cosmetic: a filter left on a settled scene root gives it a compositing layer of
            // its own, and tearing that down snaps the whole stage by a fraction of a pixel.
            const [prev, target] = prepared(new Exposure({duration: 400})).createTask().resolve as ResolverEntry[];
            expect(call(prev, 0).style).toMatchObject({opacity: 1, filter: "none"});
            expect(call(target, 1).style).toMatchObject({opacity: 1, filter: "none"});
        });

        it("burns to the full gain by the midpoint, lift ramped in with it", () => {
            const [prev] = prepared(new Exposure({duration: 400, ev: 2, lift: 0.4})).createTask().resolve as ResolverEntry[];
            // Half burnt: half the lift, half the stops.
            expect(call(prev, 0.25).style.filter).toBe("invert(1) brightness(0.8) invert(1) brightness(2)");
            // Fully burnt: the whole lift, 2^2 of gain.
            expect(call(prev, 0.5).style.filter).toBe("invert(1) brightness(0.6) invert(1) brightness(4)");
        });

        it("swaps the images at the midpoint, both halves blown out across the seam", () => {
            const [prev, target] = prepared(new Exposure({duration: 400, ev: 2, lift: 0.4})).createTask().resolve as ResolverEntry[];
            expect(call(prev, 0.49).style.opacity).toBe(1);
            expect(call(target, 0.49).style.opacity).toBe(0);
            expect(call(prev, 0.51).style.opacity).toBe(0);
            expect(call(target, 0.51).style.opacity).toBe(1);
            // The handover is invisible only because both sides are at the same full burn.
            expect(call(prev, 0.49).style.filter).toBe(call(target, 0.51).style.filter);
        });

        it("hold widens the blown-out window rather than slowing the burn", () => {
            const [prev, target] = prepared(new Exposure({duration: 400, ev: 2, lift: 0, hold: 0.5})).createTask().resolve as ResolverEntry[];
            const full = "invert(1) brightness(1) invert(1) brightness(4)";
            expect(call(prev, 0.125).style.filter).toBe("invert(1) brightness(1) invert(1) brightness(2)");
            expect(call(prev, 0.25).style.filter).toBe(full); // burnt early…
            expect(call(target, 0.75).style.filter).toBe(full); // …and held until here
            expect(call(target, 1).style.filter).toBe("none");
        });

        it("copy() returns an equivalent independent instance", () => {
            const original = new Exposure({duration: 300, ev: 3.5, lift: 0.08, hold: 0.2, easing: "easeIn"});
            const clone = original.copy();
            expect(clone).not.toBe(original);
            expect(clone).toBeInstanceOf(Exposure);
            const filterAt = (inst: Exposure, d: number) =>
                call(prepared(inst).createTask().resolve[0] as ResolverEntry, d).style.filter;
            expect(filterAt(clone, 0.3)).toBe(filterAt(original, 0.3));
        });
    });

    describe("Dissolve", () => {
        it("one 0→1 channel crossfading prev out and target in", () => {
            const task = prepared(new Dissolve({duration: 400})).createTask() as any;
            expect(task.animations).toHaveLength(1);
            expect(task.animations[0]).toMatchObject({start: 0, end: 1, duration: 400});
            expect(task.resolve).toHaveLength(2);
            expect(call(task.resolve[0], 0.25).style.opacity).toBe(0.75);
            expect(call(task.resolve[1], 0.25).style.opacity).toBe(0.25);
        });
    });

    describe("FadeIn", () => {
        // createTask only reads the story's inversion config off the game state.
        const gameStateWith = (invertX: boolean, invertY: boolean) => ({
            getStory: () => ({getInversionConfig: () => ({invertX, invertY})}),
        }) as any;
        const fadeIn = (offset: [number, number] = [120, -80], invertX = false, invertY = false) =>
            prepared(new FadeIn({duration: 700, offset})).createTask(gameStateWith(invertX, invertY));

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
            const target = prepared(new FadeIn({duration: 700})).createTask(gameStateWith(false, false)).resolve[1] as ResolverEntry;
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

    describe("Mask", () => {
        // Every pattern must be fully transparent at t=0 and fully opaque at t=1,
        // feather included, in both orientations. String endpoints pin that.
        it("wipe: sweeps the feathered edge fully off both ends", () => {
            const wipe = Mask.wipe({direction: "right", feather: 12});
            expect(wipe.mask(0)).toBe("linear-gradient(to right, #000 -12%, transparent 0%)");
            expect(wipe.mask(1)).toBe("linear-gradient(to right, #000 100%, transparent 112%)");
            expect(wipe.mask(1, true)).toBe("linear-gradient(to right, transparent -12%, #000 0%)");
            expect(Mask.wipe({direction: 135}).mask(0.5)).toContain("linear-gradient(135deg");
        });

        it("clock: a conic sweep, hard trailing edge, feathered leading edge", () => {
            const clock = Mask.clock({feather: 24});
            expect(clock.mask(0)).toBe("conic-gradient(from 0deg at 50% 50%, #000 0deg, transparent 0deg)");
            expect(clock.mask(0.5)).toBe("conic-gradient(from 0deg at 50% 50%, #000 168deg, transparent 192deg)");
            expect(clock.mask(1)).toBe("conic-gradient(from 0deg at 50% 50%, #000 360deg, transparent 384deg)");
        });

        it("clock: counterclockwise and inverted are the same reversal", () => {
            const ccw = Mask.clock({feather: 24, direction: "counterclockwise"});
            expect(ccw.mask(0.5)).toBe("conic-gradient(from 0deg at 50% 50%, transparent 168deg, #000 192deg)");
            expect(ccw.mask(1)).toBe("conic-gradient(from 0deg at 50% 50%, transparent 0deg, #000 0deg)");
            expect(Mask.clock({feather: 24}).mask(0.5, true)).toBe(ccw.mask(0.5));
        });

        it("fan: parallel sweeps, one per blade, meeting at full cover", () => {
            const fan = Mask.fan({blades: 4, feather: 10});
            expect(fan.mask(0.5)).toBe("repeating-conic-gradient(from 0deg at 50% 50%, #000 0deg, #000 40deg, transparent 50deg, transparent 90deg)");
            expect(fan.mask(1)).toBe("repeating-conic-gradient(from 0deg at 50% 50%, #000 0deg, #000 90deg, transparent 90deg, transparent 90deg)");
        });

        it("barnDoor: two one-sided layers that union, so the bands may cross the centre", () => {
            const doors = Mask.barnDoor({feather: 12});
            expect(doors.mask(0.5)).toBe("linear-gradient(to right, #000 19%, transparent 31%), linear-gradient(to left, #000 19%, transparent 31%)");
            expect(doors.mask(1)).toBe("linear-gradient(to right, #000 50%, transparent 62%), linear-gradient(to left, #000 50%, transparent 62%)");
        });

        it("barnDoor inverted: a centre bar that fades in instead of popping as a hairline", () => {
            const doors = Mask.barnDoor({feather: 12});
            // Early on the bar has not fully formed: peak alpha is capped below 1.
            expect(doors.mask(0.1, true)).toContain("rgba(0,0,0,0.517) 50%");
            expect(doors.mask(1, true)).toBe("linear-gradient(to right, transparent -12%, #000 0%, #000 100%, transparent 112%)");
        });

        it("dots: a tiled pattern carrying its own mask-size and mask-repeat", () => {
            const dots = Mask.dots({rows: 6, cols: 10, feather: 20});
            expect(dots.size).toBe("10% 16.667%");
            expect(dots.repeat).toBe("repeat");
            expect(dots.mask(0.5)).toBe("radial-gradient(circle farthest-corner at 50% 50%, #000 40%, transparent 60%)");
            expect(dots.mask(1)).toBe("radial-gradient(circle farthest-corner at 50% 50%, #000 100%, transparent 120%)");
        });

        it("dots: stagger adds a delayed corner grid for a checker-like fill", () => {
            const dots = Mask.dots({feather: 20, stagger: 0.5});
            const layers = dots.mask(0.5).split("), ");
            expect(layers).toHaveLength(2);
            expect(layers[0]).toContain("at 50% 50%");
            expect(layers[1]).toContain("at 0% 0%");
        });

        it("blinds: feathered slats collapse to the hard-edged geometry at feather 0", () => {
            expect(Mask.blinds({slats: 8}).mask(0.5))
                .toBe("repeating-linear-gradient(to bottom, #000 0, #000 6.25%, transparent 6.25%, transparent 12.5%)");
            expect(Mask.blinds({orientation: 30, slats: 4, feather: 5}).mask(0.5))
                .toContain("repeating-linear-gradient(30deg");
        });

        it("iris: reveals centre-out, and rim-in when inverted", () => {
            const iris = Mask.iris({feather: 12});
            expect(iris.mask(0.5)).toBe("radial-gradient(circle at 50% 50%, #000 63%, transparent 75%)");
            expect(iris.mask(0.5, true)).toBe("radial-gradient(circle at 50% 50%, transparent 63%, #000 75%)");
            expect(Mask.iris({shape: "ellipse"}).mask(0.5)).toContain("radial-gradient(ellipse at 50% 50%");
        });

        it("invert: swaps the natural and inverted orientations", () => {
            const rimIn = Mask.invert(Mask.iris({feather: 12}));
            expect(rimIn.mask(0.5)).toBe(Mask.iris({feather: 12}).mask(0.5, true));
            expect(rimIn.mask(0.5, true)).toBe(Mask.iris({feather: 12}).mask(0.5));
        });
    });

    describe("Reveal", () => {
        it("one 0→1 channel, prev untouched + target masked by the pattern", () => {
            const task = prepared(new Reveal({duration: 400, pattern: Mask.clock({feather: 24})})).createTask() as any;
            expect(task.animations).toHaveLength(1);
            expect(task.animations[0]).toMatchObject({start: 0, end: 1, duration: 400});
            expect(task.resolve).toHaveLength(2);
            expect(keyOf(task.resolve[0])).toBe("current");
            expect(keyOf(task.resolve[1])).toBe("target");
            expect(call(task.resolve[1], 0.5).style.maskImage)
                .toBe("conic-gradient(from 0deg at 50% 50%, #000 168deg, transparent 192deg)");
        });

        it("fully hidden at t=0 and fully revealed at t=1, feather included", () => {
            const target = prepared(new Reveal({duration: 400, pattern: Mask.wipe({direction: "right", feather: 12})})).createTask().resolve[1] as ResolverEntry;
            expect(call(target, 0).style.maskImage).toContain("#000 -12%");
            expect(call(target, 1).style.maskImage).toContain("#000 100%");
        });

        it("carries the pattern's tiling onto the mask style", () => {
            const target = prepared(new Reveal({duration: 400, pattern: Mask.dots({rows: 6, cols: 10})})).createTask().resolve[1] as ResolverEntry;
            const style = call(target, 0.5).style;
            expect(style.maskSize).toBe("10% 16.667%");
            expect(style.maskRepeat).toBe("repeat");
            expect(style.WebkitMaskSize).toBe("10% 16.667%");
        });

        it("accepts a hand-written pattern", () => {
            const target = prepared(new Reveal({
                duration: 400,
                pattern: {mask: (t) => `linear-gradient(#000 ${t * 100}%, transparent 100%)`},
            })).createTask().resolve[1] as ResolverEntry;
            expect(call(target, 0.25).style.maskImage).toBe("linear-gradient(#000 25%, transparent 100%)");
        });

        it("copy() returns an equivalent independent instance", () => {
            const original = new Reveal({duration: 500, pattern: Mask.fan({blades: 6, feather: 8})});
            const clone = original.copy();
            expect(clone).not.toBe(original);
            expect(clone).toBeInstanceOf(Reveal);
            const targetAtMid = (inst: Reveal) => call(prepared(inst).createTask().resolve[1] as ResolverEntry, 0.5).style;
            expect(targetAtMid(clone)).toEqual(targetAtMid(original));
        });
    });

    describe("ThroughColor", () => {
        it("without a pattern: a colour overlay that fully covers (opacity) at the hold", () => {
            const task = prepared(new ThroughColor({duration: 600, color: "#000000", hold: 0.4})).createTask() as any;
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
            const task = prepared(new ThroughColor({duration: 600, color: "#000000", hold: 0.4})).createTask() as any;
            expect(call(task.resolve[0], 0.2).style.opacity).toBe(1);
            expect(call(task.resolve[0], 0.8).style.opacity).toBe(0);
            expect(call(task.resolve[1], 0.2).style.opacity).toBe(0);
            expect(call(task.resolve[1], 0.8).style.opacity).toBe(1);
        });

        it("honours the hold colour and the pattern geometry", () => {
            const overlayAt = (inst: ThroughColor, t: number) =>
                call(prepared(inst).createTask().resolve[2] as ResolverEntry, t).style;
            expect(overlayAt(new ThroughColor({duration: 600, color: "#ffffff"}), 0.5).backgroundColor).toBe("#ffffff");
            expect(overlayAt(new ThroughColor({duration: 600, pattern: Mask.wipe({direction: "right", feather: 15})}), 0.5).maskImage)
                .toContain("linear-gradient(to right");
            // inverted: true is the classic iris-to-black — the colour closes rim-in.
            expect(overlayAt(new ThroughColor({duration: 600, pattern: Mask.iris(), inverted: true}), 0.175).maskImage)
                .toContain("radial-gradient(circle at 50% 50%, transparent");
            expect(overlayAt(new ThroughColor({duration: 600, pattern: Mask.blinds({orientation: "vertical", slats: 6})}), 0.5).maskImage)
                .toContain("repeating-linear-gradient(to right");
            expect(overlayAt(new ThroughColor({duration: 600, pattern: Mask.clock({feather: 24})}), 0.5).maskImage)
                .toBe("conic-gradient(from 0deg at 50% 50%, #000 360deg, transparent 384deg)");
        });

        it("copy() returns an equivalent independent instance", () => {
            const original = new ThroughColor({
                duration: 600,
                color: "#123456",
                hold: 0.25,
                pattern: Mask.wipe({direction: "top", feather: 20}),
                uncover: "continue",
            });
            const clone = original.copy();
            expect(clone).not.toBe(original);
            expect(clone).toBeInstanceOf(ThroughColor);
            const overlayAt = (inst: ThroughColor, t: number) => call(inst.createTask().resolve[2] as ResolverEntry, t).style;
            expect(overlayAt(clone, 0.5)).toEqual(overlayAt(original, 0.5));
            expect(overlayAt(clone, 0.825)).toEqual(overlayAt(original, 0.825));
        });
    });

    describe("ThroughColor uncover modes", () => {
        // hold 0.3 → covering ends at 0.35, uncovering starts at 0.65.
        it("retreat (default): the cover pattern backs out the way it came", () => {
            const overlay = prepared(new ThroughColor({duration: 600, pattern: Mask.wipe({direction: "right", feather: 12})})).createTask().resolve[2] as ResolverEntry;
            const covering = call(overlay, 0.175).style.maskImage as string; // cover 0.5
            const uncovering = call(overlay, 0.825).style.maskImage as string; // cover 0.5
            expect(uncovering).toBe(covering);
            expect(uncovering).toContain("#000 44%");
        });

        it("continue: the edge keeps travelling instead of backing out", () => {
            const overlay = prepared(new ThroughColor({duration: 600, pattern: Mask.wipe({direction: "right", feather: 12}), uncover: "continue"})).createTask().resolve[2] as ResolverEntry;
            // Covering: opaque grows from the near side.
            expect(call(overlay, 0.175).style.maskImage).toBe("linear-gradient(to right, #000 44%, transparent 56%)");
            // Uncovering at the same coverage: the transparent region has entered
            // from the near side — the inverted orientation of the same pattern.
            expect(call(overlay, 0.825).style.maskImage).toBe("linear-gradient(to right, transparent 44%, #000 56%)");
            // The switch happens behind a fully covered frame, so it is seamless.
            expect(call(overlay, 0.65).style.maskImage).toBe("linear-gradient(to right, transparent -12%, #000 0%)");
        });

        it("a custom pattern uncovers through its own geometry", () => {
            const overlay = prepared(new ThroughColor({
                duration: 600,
                pattern: Mask.clock(),
                uncover: Mask.iris({feather: 12}),
            })).createTask().resolve[2] as ResolverEntry;
            expect(call(overlay, 0.175).style.maskImage).toContain("conic-gradient");
            expect(call(overlay, 0.825).style.maskImage).toContain("radial-gradient");
        });
    });
});
