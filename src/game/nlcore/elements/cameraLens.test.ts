import {describe, expect, it} from "vitest";
// Through the public barrel, as `camera.test.ts` does: importing camera.ts on its own trips a
// pre-existing circular static-init order between transform/gameState/scene/text.
import {Camera, Image, Story, Transform} from "@core/common/core";
// The projection helpers have no cycle of their own — they read nothing but their argument — so
// they are imported directly, and this test collecting at all is the assertion that adding them
// introduced no import cycle into the displayable graph.
import {
    CameraLensDefaults,
    lensAmount,
    shutterBottomStyle,
    shutterTopStyle,
    vignetteStyle,
} from "@core/elements/cameraLens";
import {TransformState} from "@core/elements/transform/transform";
import {Chained} from "@core/action/chain";
import {DisplayableActionTypes} from "@core/action/actionTypes";

function transformSequences(chain: unknown): { props: Record<string, unknown>; options?: Record<string, unknown> }[] {
    const actions = Chained.toActions([chain as never]);
    const action = actions.find((a) => a.type === DisplayableActionTypes.applyTransform);
    if (!action) {
        throw new Error("camera helper produced no applyTransform action");
    }
    const [transform] = (action.contentNode as { getContent: () => [unknown] }).getContent();
    return (transform as { sequences: { props: Record<string, unknown>; options?: Record<string, unknown> }[] }).sequences;
}

describe("lens channel reading", () => {
    it("clamps to 0..1", () => {
        expect(lensAmount(0.4)).toBe(0.4);
        expect(lensAmount(2)).toBe(1);
        expect(lensAmount(-3)).toBe(0);
    });

    /**
     * The reason this is a rule and not tidiness: these numbers go straight into `inset()`, and one
     * `NaN%` makes the browser drop the whole declaration — so the plate would stop clipping and
     * paint solid black over the stage. `undefined` is the everyday case, not a hypothetical: it is
     * what every save written before these channels existed deserialises to.
     */
    it("reads anything that is not a finite number as 0", () => {
        expect(lensAmount(undefined)).toBe(0);
        expect(lensAmount(NaN)).toBe(0);
        expect(lensAmount(Infinity)).toBe(0);
        expect(lensAmount("0.5")).toBe(0);
        expect(lensAmount(null)).toBe(0);
    });
});

describe("shutter geometry", () => {
    it("draws nothing when open", () => {
        expect(shutterTopStyle({shutter: 0}).clipPath).toBe("inset(0 0 100% 0)");
        expect(shutterBottomStyle({shutter: 0}).clipPath).toBe("inset(100% 0 0 0)");
    });

    // The geometry the previous `blink` routine animated by hand, kept to the digit: each blade
    // covers half the frame and the two meet in the middle.
    it("covers half the frame per blade when shut", () => {
        expect(shutterTopStyle({shutter: 1}).clipPath).toBe("inset(0 0 50% 0)");
        expect(shutterBottomStyle({shutter: 1}).clipPath).toBe("inset(50% 0 0 0)");
    });

    it("is a letterbox at small values", () => {
        expect(shutterTopStyle({shutter: 0.12}).clipPath).toBe("inset(0 0 94% 0)");
        expect(shutterBottomStyle({shutter: 0.12}).clipPath).toBe("inset(94% 0 0 0)");
    });

    it("produces no NaN from a state that predates the channel", () => {
        for (const style of [shutterTopStyle({}), shutterBottomStyle({})]) {
            expect(style.clipPath).not.toContain("NaN");
            expect(style.backgroundColor).toBe("#000");
        }
        expect(shutterTopStyle({}).clipPath).toBe("inset(0 0 100% 0)");
    });

    it("takes a colour", () => {
        expect(shutterTopStyle({shutter: 1, shutterColor: "#fff"}).backgroundColor).toBe("#fff");
    });
});

describe("vignette geometry", () => {
    it("maps strength onto the plate's opacity", () => {
        expect(vignetteStyle({vignette: 0.72}).opacity).toBe(0.72);
        expect(vignetteStyle({}).opacity).toBe(0);
    });

    // The mask string the previous `vignette` routine built, defaults included.
    it("builds the radial mask from the falloff radii", () => {
        expect(vignetteStyle({vignette: 1}).maskImage)
            .toBe("radial-gradient(circle at center, transparent 44%, black 78%)");
        expect(vignetteStyle({vignette: 1, vignetteInner: "10%", vignetteOuter: "90%"}).maskImage)
            .toBe("radial-gradient(circle at center, transparent 10%, black 90%)");
    });

    it("carries the WebKit-prefixed mask fields the mask needs to work at all", () => {
        const style = vignetteStyle({vignette: 1}) as Record<string, unknown>;
        expect(style.WebkitMaskImage).toBe(style.maskImage);
        expect(style.maskSize).toBe("100% 100%");
        expect(style.maskMode).toBe("alpha");
        expect(style.maskRepeat).toBe("no-repeat");
    });

    it("takes a colour", () => {
        expect(vignetteStyle({vignette: 1, vignetteColor: "#1a0b2e"}).backgroundColor).toBe("#1a0b2e");
    });
});

describe("the camera owns the lens defaults", () => {
    it("starts with the lens neutral", () => {
        const state = new Camera().transformState.get();
        expect(state.shutter).toBe(0);
        expect(state.vignette).toBe(0);
        expect(state.vignetteInner).toBe("44%");
        expect(state.vignetteOuter).toBe("78%");
        expect(state.shutterColor).toBe("#000");
        expect(state.vignetteColor).toBe("#000");
    });

    /**
     * `ConfigConstructor.create` copies only the keys its own defaults declare, so a camera-only
     * prop that is not in the table the camera's initial state is built from is dropped at
     * construction — no error, no warning, and every later lens action animates from a state the
     * renderer never agreed to.
     */
    it("keeps a lens value given to the constructor", () => {
        expect(new Camera({shutter: 0.12}).transformState.get().shutter).toBe(0.12);
        expect(new Camera({vignetteOuter: "95%"}).transformState.get().vignetteOuter).toBe("95%");
    });

    /**
     * The other wrong place to have put them. That table belongs to every image, text, layer and
     * puppet as well, and none of them has a lens: a leak there would put six dead props on the
     * state of every sprite in the game and into every save.
     */
    it("does not leak the lens onto the shared displayable defaults", () => {
        const shared = TransformState.DefaultTransformState.getDefaultConfig() as Record<string, unknown>;
        for (const key of Object.keys(CameraLensDefaults)) {
            expect(shared).not.toHaveProperty(key);
        }
        expect(new Image({src: "a.png"}).transformState.get()).not.toHaveProperty("shutter");
    });
});

describe("camera lens actions", () => {
    it("stages the channel it names", () => {
        expect(transformSequences(new Camera().shutter(1, 180))[0].props).toEqual({shutter: 1});
        expect(transformSequences(new Camera().vignette(0.72, 300))[0].props).toEqual({vignette: 0.72});
    });

    it("clamps out-of-range strengths", () => {
        expect(transformSequences(new Camera().shutter(4))[0].props.shutter).toBe(1);
        expect(transformSequences(new Camera().vignette(-1))[0].props.vignette).toBe(0);
        expect(transformSequences(new Camera().shutter(NaN))[0].props.shutter).toBe(0);
    });

    it("sets geometry and colour through lens()", () => {
        expect(transformSequences(new Camera().lens({vignetteInner: "20%", vignetteColor: "#fff"}))[0].props)
            .toEqual({vignetteInner: "20%", vignetteColor: "#fff"});
    });
});

/**
 * `resetCamera` is the author's only escape hatch, and it lists the props it neutralises one by
 * one. A channel missing from that list is a shutter that stays shut with no way to open it.
 */
describe("resetCamera clears the lens", () => {
    it("eases the strengths back to neutral with the pose", () => {
        const sequences = transformSequences(new Camera().resetCamera(600));
        expect(sequences[1].props.shutter).toBe(0);
        expect(sequences[1].props.vignette).toBe(0);
        expect(sequences[1].options?.duration).toBe(600);
    });

    // Cut, and only after the fade: snapping the falloff radius while the vignette is still
    // visible is a visible jump, while cutting it once the strength is 0 shows nothing.
    it("restores geometry and colour in a zero-duration step afterwards", () => {
        const sequences = transformSequences(new Camera().resetCamera(600));
        expect(sequences).toHaveLength(3);
        expect(sequences[2].props).toEqual({
            shutterColor: "#000",
            vignetteColor: "#000",
            vignetteInner: "44%",
            vignetteOuter: "78%",
        });
        expect(sequences[2].options?.duration).toBe(0);
    });
});

describe("saves", () => {
    it("round-trips the lens channels", () => {
        const data = new Camera({shutter: 0.5, vignette: 0.25, vignetteInner: "30%"}).toData();
        const restored = new Camera().fromData(data).transformState.get();
        expect(restored.shutter).toBe(0.5);
        expect(restored.vignette).toBe(0.25);
        expect(restored.vignetteInner).toBe("30%");
    });

    /**
     * A save written before these channels existed carries no lens keys at all. Nothing needed to
     * change in the serializer for that — it passes unknown keys straight through — but the state
     * that comes back out is genuinely missing them, and the projections above are what has to
     * survive it.
     */
    it("loads a camera state that predates the lens without producing NaN", () => {
        const camera = new Camera().fromData({transformState: {zoom: 2, opacity: 1}});
        const state = camera.transformState.get();
        expect(state.zoom).toBe(2);
        expect(state).not.toHaveProperty("shutter");
        expect(shutterTopStyle(state).clipPath).toBe("inset(0 0 100% 0)");
        expect(vignetteStyle(state).opacity).toBe(0);
    });
});

describe("the lens is reachable from a Transform", () => {
    it("stages lens props like any other channel", () => {
        const transform = Transform.create().lens({shutter: 1}).commit({duration: 180});
        const sequences = (transform as unknown as { sequences: { props: Record<string, unknown> }[] }).sequences;
        expect(sequences[0].props).toEqual({shutter: 1});
    });

    it("gives a story a camera whose lens is neutral", () => {
        expect(new Story("s").camera.transformState.get().shutter).toBe(0);
    });
});
