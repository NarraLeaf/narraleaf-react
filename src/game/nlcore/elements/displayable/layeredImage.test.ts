import {describe, expect, it} from "vitest";
import {Image} from "./image";
import {Dissolve} from "@core/elements/transition/transitions/image/dissolve";

function makeYuko() {
    return new Image({
        src: {
            layers: [
                "body.png",
                {uniform: "uniform.png", casual: "casual.png"},
                {happy: "happy.png", sad: "sad.png"},
                {noHat: null, straw: "straw.png"},
                (tags) => tags.has("sad") ? "tears.png" : null,
            ],
            defaults: ["uniform", "happy", "noHat"],
        },
    });
}

describe("layered image - src resolution", () => {
    it("resolves defaults into one src per layer, bottom to top", () => {
        expect(Image.getSrcURLs(makeYuko() as Image)).toEqual([
            "body.png", "uniform.png", "happy.png", null, null,
        ]);
    });

    it("keeps untouched layers when one tag changes", () => {
        const yuko = makeYuko();
        yuko.state.currentSrc = yuko.resolveTags(yuko.state.currentSrc as string[], ["sad"]) as [];

        expect(Image.getSrcURLs(yuko as Image)).toEqual([
            "body.png", "uniform.png", "sad.png", null, "tears.png",
        ]);
    });

    it("accepts tags in any order and applies them all", () => {
        const yuko = makeYuko();
        yuko.state.currentSrc = yuko.resolveTags(yuko.state.currentSrc as string[], ["straw", "casual"]) as [];

        expect(Image.getSrcURLs(yuko as Image)).toEqual([
            "body.png", "casual.png", "happy.png", "straw.png", null,
        ]);
    });

    it("has no single src url", () => {
        expect(Image.getSrcURL(makeYuko() as Image)).toBeNull();
    });
});

describe("layered image - preload", () => {
    it("registers every variant, not their cross product", () => {
        expect(Image.getAllLayerSrc(makeYuko() as Image).sort()).toEqual([
            "body.png", "casual.png", "happy.png", "sad.png", "straw.png", "uniform.png",
        ]);
    });
});

describe("layered image - config validation", () => {
    it("rejects a layer that has no default", () => {
        expect(() => new Image({
            src: {
                layers: [{happy: "happy.png", sad: "sad.png"}],
                defaults: [],
            },
        })).toThrow(/Layer has no default/);
    });

    it("rejects a tag that is not declared by any layer", () => {
        expect(() => new Image({
            src: {
                layers: [{happy: "happy.png", sad: "sad.png"}],
                defaults: ["hapy" as "happy"],
            },
        })).toThrow(/Tag not found/);
    });

    it("rejects the same tag declared on two layers", () => {
        expect(() => new Image({
            src: {
                layers: [
                    {none: null, hat: "hat.png"},
                    {none: null, scarf: "scarf.png"},
                ],
                defaults: ["none"],
            },
        })).toThrow(/Tags in groups must be unique/);
    });
});

describe("layered image - serialization", () => {
    it("round-trips through tags, not resolved urls", () => {
        const yuko = makeYuko();
        yuko.state.currentSrc = yuko.resolveTags(yuko.state.currentSrc as string[], ["sad", "casual"]) as [];

        const restored = makeYuko();
        restored.fromData(yuko.toData());

        expect(restored.state.currentSrc).toEqual(yuko.state.currentSrc);
        expect(Image.getSrcURLs(restored as Image)).toEqual([
            "body.png", "casual.png", "sad.png", null, "tears.png",
        ]);
    });
});

describe("layered image - transitions", () => {
    function resolversOf(image: Image, tags: string[]) {
        const transition = new Dissolve({duration: 500});
        transition
            ._setPrevLayers(Image.getSrcURLs(image))
            ._setTargetLayers(Image.getSrcURLs(image, tags));
        return {transition, resolve: transition.createTask().resolve};
    }

    it("drives one element per side, keyed so the outgoing element is reused", () => {
        const {resolve} = resolversOf(makeYuko() as Image, ["sad"]);

        expect(resolve.map(r => typeof r === "function" ? null : r.key)).toEqual(["current", "target"]);
    });

    it("contributes style only - a stack resolves its own layer srcs", () => {
        const {resolve} = resolversOf(makeYuko() as Image, ["sad"]);
        const props = resolve.map(r => (typeof r === "function" ? r : r.resolver)(0.5));

        expect(props.every(p => !("src" in p))).toBe(true);
        expect(props.map(p => p.style?.opacity)).toEqual([0.5, 0.5]);
    });

    it("never puts opacity on a layer - the stack carries it as a group", () => {
        const {resolve} = resolversOf(makeYuko() as Image, ["sad"]);
        const props = resolve.map(r => (typeof r === "function" ? r : r.resolver)(0.25));

        // Both sides address a whole stack; nothing here can reach an individual layer.
        expect(props.map(p => Object.keys(p))).toEqual([["style"], ["style"]]);
    });

    it("still injects src for a non-layered image", () => {
        const transition = new Dissolve({duration: 500});
        transition._setPrevSrc("a.png")._setTargetSrc("b.png");
        const props = transition.createTask().resolve
            .map(r => (typeof r === "function" ? r : r.resolver)(0.5));

        expect(props.map(p => p.src)).toEqual(["a.png", "b.png"]);
    });

    it("crossfades between the layer stacks the tags resolve to", () => {
        const yuko = makeYuko();
        const {transition} = resolversOf(yuko as Image, ["sad", "casual"]);

        expect(transition._getPrevLayers()).toEqual(["body.png", "uniform.png", "happy.png", null, null]);
        expect(transition._getTargetLayers()).toEqual(["body.png", "casual.png", "sad.png", null, "tears.png"]);
    });
});
