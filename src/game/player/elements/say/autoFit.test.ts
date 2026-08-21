import { describe, expect, it } from "vitest";
import { Word } from "@core/elements/character/word";
import { inheritedScaledFontSize, scaledFontSize } from "@player/elements/say/autoFit";
import { getGeneratedWords } from "@player/elements/say/Sentence";

/**
 * Auto fit's two arithmetic seams, which are the parts that can be checked without a layout engine.
 *
 * The search itself is measurement against a real box, so it belongs on the machine; what belongs
 * here is that a size survives being scaled whatever unit it was written in, and that the sentence
 * the copy is measured from is the sentence the typewriter will end up drawing.
 */

describe("scaledFontSize", () => {
    it("leaves the size alone at full scale", () => {
        expect(scaledFontSize(24, 1)).toBe(24);
        expect(scaledFontSize("1.5rem", 1)).toBe("1.5rem");
    });

    it("scales a size whatever unit it carries", () => {
        expect(scaledFontSize(24, 0.5)).toBe("calc(24px * 0.5)");
        expect(scaledFontSize("1.5rem", 0.5)).toBe("calc(1.5rem * 0.5)");
        expect(scaledFontSize("2em", 0.75)).toBe("calc(2em * 0.75)");
    });

    it("takes the scale as a custom property for the copy being measured", () => {
        expect(scaledFontSize(24, "var(--nl-auto-fit-scale, 1)")).toBe("calc(24px * var(--nl-auto-fit-scale, 1))");
    });

    it("leaves an unset size unset, so it keeps inheriting", () => {
        expect(scaledFontSize(undefined, 0.5)).toBeUndefined();
    });

    it("sets an inherited size as a share of what it inherits", () => {
        expect(inheritedScaledFontSize(0.5)).toBe("50%");
        expect(inheritedScaledFontSize(1)).toBeUndefined();
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
