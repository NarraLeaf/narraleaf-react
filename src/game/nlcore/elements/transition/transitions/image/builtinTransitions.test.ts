import {describe, expect, it} from "vitest";
import {Blinds, BlurDissolve, FadeIn, Push, SoftIris, SoftWipe, ThroughColor} from "narraleaf-react";

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
