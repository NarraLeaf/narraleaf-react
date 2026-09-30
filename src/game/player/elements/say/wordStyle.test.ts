import { describe, expect, it } from "vitest";
import { emphasisStyle, previewWordFontSize, wordFontSize } from "./wordStyle";

describe("wordFontSize", () => {
    it("scales an absolute size with the line", () => {
        expect(wordFontSize({ fontSize: 24 }, 16)).toBe("calc(24px * var(--nl-text-scale, 1))");
    });

    it("leaves a relative size alone, since em already resolves against the scaled line", () => {
        expect(wordFontSize({ fontScale: 1.25 }, 16)).toBe("1.25em");
    });

    it("prefers the absolute size when a word carries both", () => {
        expect(wordFontSize({ fontSize: 24, fontScale: 1.25 }, 16)).toBe("calc(24px * var(--nl-text-scale, 1))");
    });

    it("falls back to the line's own size", () => {
        expect(wordFontSize({}, 16)).toBe("calc(16px * var(--nl-text-scale, 1))");
        expect(wordFontSize({}, undefined)).toBeUndefined();
    });
});

describe("previewWordFontSize", () => {
    it("carries sizes through unscaled, a sample line having no box to fit", () => {
        expect(previewWordFontSize({ fontSize: 24 }, 16)).toBe(24);
        expect(previewWordFontSize({ fontScale: 0.8 }, 16)).toBe("0.8em");
        expect(previewWordFontSize({}, 16)).toBe(16);
    });
});

describe("emphasisStyle", () => {
    it("is nothing at all for a word with no emphasis", () => {
        expect(emphasisStyle(undefined)).toEqual({});
    });

    it("defaults to a filled dot above the line", () => {
        expect(emphasisStyle({})).toEqual({
            textEmphasis: "filled dot",
            textEmphasisPosition: "over right",
        });
    });

    it("draws the Chinese convention below the line", () => {
        expect(emphasisStyle({ position: "under" })).toEqual({
            textEmphasis: "filled dot",
            textEmphasisPosition: "under right",
        });
    });

    it("keeps the vertical keyword on the right whichever side the marks sit", () => {
        expect(emphasisStyle({ mark: "circle", fill: "open" })).toEqual({
            textEmphasis: "open circle",
            textEmphasisPosition: "over right",
        });
        expect(emphasisStyle({ mark: "sesame", position: "under" }).textEmphasisPosition).toBe("under right");
    });
});
