import {describe, expect, it} from "vitest";
import {Text} from "@core/elements/displayable/text";
import {Image} from "@core/elements/displayable/image";
import {Layer} from "@core/elements/layer";
import {Puppet} from "@core/elements/displayable/puppet";

/**
 * Two things, and the first is why the second could not be tested before.
 *
 * **Importing displayables directly.** `Layer`, `Image`, `Text` and `Puppet` each built a default
 * config in a `static` field, spreading `TransformState.DefaultTransformState.getDefaultConfig()` —
 * a read of another module. `scene.ts` imports all four and `text.ts` imports `scene.ts`, so the
 * cycle could reach one of those initialisers before `transform/transform` had assigned its exports;
 * whichever was hit first threw `Cannot read properties of undefined (reading
 * 'DefaultTransformState')` from a stack naming neither module. The file you are reading is the
 * regression test: it imports all four, and its mere collection is the assertion.
 *
 * **Constructor config reaching the element.** `ConfigConstructor.create` copies only the keys its
 * own defaults declare. `ITextUserConfig extends TextTransformProps`, so `new Text("hi", {opacity: 0})`
 * type-checked while the 0 went nowhere. That is not cosmetic: constructor config is the state that
 * survives `reset()`, so it is what a save restores and what an editor host uses to pre-pose a stage.
 */
describe("displayable modules can be imported directly", () => {
    it("has all four classes, which means no static initialiser threw during collection", () => {
        expect(typeof Layer).toBe("function");
        expect(typeof Image).toBe("function");
        expect(typeof Text).toBe("function");
        expect(typeof Puppet).toBe("function");
    });

    it("still builds each default config", () => {
        expect(Layer.DefaultUserConfig).toBeTruthy();
        expect(Image.DefaultUserConfig).toBeTruthy();
        expect(Text.DefaultUserConfig).toBeTruthy();
        expect(Puppet.DefaultUserConfig).toBeTruthy();
    });

    it("memoises rather than rebuilding per access", () => {
        expect(Text.DefaultUserConfig).toBe(Text.DefaultUserConfig);
        expect(Layer.DefaultUserConfig).toBe(Layer.DefaultUserConfig);
    });
});

describe("Text constructor config reaches the transform state", () => {
    it("keeps opacity", () => {
        expect(new Text("hi", {opacity: 0}).transformState.get().opacity).toBe(0);
    });

    it("keeps scale and rotation", () => {
        const text = new Text("hi", {scaleX: 2, rotation: 90});
        expect(text.transformState.get().scaleX).toBe(2);
        expect(text.transformState.get().rotation).toBe(90);
    });

    it("keeps fontColor, which it always did", () => {
        expect(new Text("hi", {fontColor: "#f00"}).transformState.get().fontColor).toBe("#f00");
    });

    /**
     * A position now reaches `Text` at all, and it lands the same way `Image` lands it.
     *
     * Deliberately a comparison rather than an assertion about the stored shape: both go through
     * `PositionUtils.tryParsePosition`, which leaves an already-valid raw position as it is — the
     * conversion happens later, at render. Pinning "same as Image" is the property this change is
     * for, and it keeps passing if that representation is ever changed for both.
     */
    it("takes a position, and stores it the way Image does", () => {
        const raw = {xalign: 0.3, yalign: 0.6};
        const fromText = new Text("hi", {position: raw}).transformState.get().position;
        const fromImage = new Image({src: "a.png", position: raw}).transformState.get().position;
        expect(fromText).toBeTruthy();
        expect(fromText).toEqual(fromImage);
    });

    it("survives reset, which is what makes it the state a save restores", () => {
        const text = new Text("hi", {opacity: 0.25});
        text.reset();
        expect(text.transformState.get().opacity).toBe(0.25);
    });
});

describe("the shape Text was brought in line with", () => {
    it("keeps an Image's opacity", () => {
        expect(new Image({src: "a.png", opacity: 0}).transformState.get().opacity).toBe(0);
    });

    it("keeps a Puppet's opacity", () => {
        expect(new Puppet({backend: "b", src: "s", opacity: 0}).transformState.get().opacity).toBe(0);
    });
});
