import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

/**
 * Where a Vfx's `mix-blend-mode` is declared, guarded by reading the source.
 *
 * This is a text assertion rather than a rendering one on purpose, and the reason is the bug it
 * exists for. A Vfx renders as a `<video>` inside a wrapper div that carries `z-index`, and a
 * positioned element with a numeric z-index IS a stacking context — so a blend mode declared on the
 * video blends against the wrapper's own empty backdrop instead of the stage. Nothing about the
 * markup is wrong; every prop arrives, the element is exactly where it should be, and `screen`
 * simply behaves as `normal`. For a clip rendered as light on black — every baked weather clip is —
 * that is an opaque black rectangle over the entire scene.
 *
 * No headless assertion can catch that: it is a compositing outcome, and this suite runs in node
 * with no DOM, let alone a compositor. What CAN be pinned down is the one structural fact the
 * outcome follows from — the blend is declared on the element that owns the stacking context, not
 * inside it. Anyone moving it back gets this failure and its explanation.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => fs.readFileSync(path.resolve(here, relative), "utf8");

describe("vfx blend placement", () => {
    it("declares the blend on the wrapper that owns the stacking context", () => {
        const player = read("../Player.tsx");
        // The same style object as the z-index: that is what makes this the blended group rather
        // than something painted inside an isolated one.
        expect(player).toContain("style={{zIndex: vfx.config.zIndex, mixBlendMode: vfx.config.blendMode}}");
    });

    it("does not declare it again on the video inside", () => {
        const video = read("./Vfx.tsx");
        expect(video).not.toMatch(/mixBlendMode\s*:/);
    });
});
