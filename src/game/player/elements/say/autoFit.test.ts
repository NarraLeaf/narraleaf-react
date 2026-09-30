import { describe, expect, it } from "vitest";
import { Word } from "@core/elements/character/word";
import { inheritedScaledFontSize, scaledFontSize } from "@player/elements/say/autoFit";
import { getGeneratedWords } from "@player/elements/say/Sentence";

/**
 * The two seams of text scaling that can be checked without a layout engine.
 *
 * The measuring itself is a live element against a real box, so it belongs on the machine; what
 * belongs here is that every size in the line is written against the one multiplier, whatever unit
 * it was authored in, and that the words the typewriter hands over are whole words.
 */

describe("scaledFontSize", () => {
    it("writes a size against the line's multiplier, whatever unit it carries", () => {
        expect(scaledFontSize(24)).toBe("calc(24px * var(--nl-text-scale, 1))");
        expect(scaledFontSize("1.5rem")).toBe("calc(1.5rem * var(--nl-text-scale, 1))");
        expect(scaledFontSize("2em")).toBe("calc(2em * var(--nl-text-scale, 1))");
    });

    it("leaves an unset size unset, so it keeps inheriting the line", () => {
        expect(scaledFontSize(undefined)).toBeUndefined();
        expect(scaledFontSize("")).toBeUndefined();
    });

    it("scales an inherited size against what it inherits", () => {
        expect(inheritedScaledFontSize()).toBe("calc(1em * var(--nl-text-scale, 1))");
    });
});

describe("getGeneratedWords", () => {
    it("hands back whole words, not one element per character", () => {
        const words = getGeneratedWords([
            new Word<string>("NarraLeaf "),
            new Word<string>("React"),
        ]);
        expect(words.map(word => (word === "\n" ? "\n" : word.text))).toEqual(["NarraLeaf ", "React"]);
    });

    it("keeps a line break as its own element", () => {
        const words = getGeneratedWords([new Word<string>("上\n下")]);
        expect(words.map(word => (word === "\n" ? "\n" : word.text))).toEqual(["上", "\n", "下"]);
    });

    it("reads every word as revealed, which is what a finished line is", () => {
        const words = getGeneratedWords([new Word<string>("以太浓度")]);
        const word = words[0];
        expect(word === "\n" ? null : word.text).toBe("以太浓度");
        expect(word === "\n" ? null : word.full).toBe("以太浓度");
    });
});
