import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

/**
 * A hidden overlay must cost nothing, guarded by reading the source.
 *
 * Hiding a Vfx used to remove it from the stage, so the element was unmounted and the browser
 * stopped decoding whether or not anything asked it to. It stays mounted now — that is what makes
 * the next `show` instant instead of a fresh fetch and decode — which turns the `pause()` in the
 * hide handler into the ONLY thing stopping a full-screen video from decoding forever behind the
 * scene, for the rest of the session, at zero opacity where nobody can see that it is happening.
 *
 * A rendering assertion cannot catch that: this suite runs in node with no DOM, and "is the decoder
 * running" is not observable from the element even where there is one. What can be pinned is the
 * call, and this is the file that explains why deleting it is not the small cleanup it looks like.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => fs.readFileSync(path.resolve(here, relative), "utf8");

describe("a hidden vfx", () => {
    it("stops playback when it fades out, because nothing else will", () => {
        const source = read("./Vfx.tsx");
        const start = source.indexOf("hide: async");
        const end = source.indexOf("pause: () =>", start);
        expect(start, "the hide handler moved; find it and re-point this test").toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);

        expect(source.slice(start, end)).toContain("el.pause()");
    });

    it("restates the playback rate on every showing, so an override cannot leak into the next one", () => {
        // `show` takes a per-showing rate. Setting it only when one is given would leave the previous
        // showing's override in place on an element that is no longer unmounted between showings -
        // the plain `show()` after an overridden one would silently keep running fast.
        const source = read("./Vfx.tsx");
        expect(source).toContain("el.playbackRate = options?.rate ?? vfx.config.playbackRate;");
    });
});
