import { describe, expect, it } from "vitest";
import React from "react";
import {
    isVerticalWritingMode,
    renderWordText,
    resolveTateChuYokoMaxLength,
    segmentVerticalText,
    verticalContainerStyle,
    wordBreakStyleFor,
} from "./verticalText";

describe("vertical writing mode", () => {
    it("recognises the two vertical modes", () => {
        expect(isVerticalWritingMode("vertical-rl")).toBe(true);
        expect(isVerticalWritingMode("vertical-lr")).toBe(true);
        expect(isVerticalWritingMode("horizontal-tb")).toBe(false);
        expect(isVerticalWritingMode(undefined)).toBe(false);
    });

    it("writes glyph orientation only where it means something", () => {
        expect(verticalContainerStyle(undefined, "upright")).toEqual({});
        expect(verticalContainerStyle("horizontal-tb", "upright")).toEqual({ writingMode: "horizontal-tb" });
        expect(verticalContainerStyle("vertical-rl", undefined)).toEqual({
            writingMode: "vertical-rl",
            textOrientation: "mixed",
        });
    });

    /**
     * The reason this file exists. `break-all` may not come back: it cuts an English word in half
     * wherever the line runs out. `strict` is the kinsoku set a printed book is typeset to, and
     * both writing modes are set to it - a column breaks by the same rules a line does - which is
     * why nothing here is asked which mode it is.
     */
    it("leaves a word whole and lets the browser break the line legally", () => {
        expect(wordBreakStyleFor()).toEqual({
            wordBreak: "normal",
            lineBreak: "strict",
            overflowWrap: "break-word",
        });
    });
});

describe("tate-chu-yoko", () => {
    it("reads the setting", () => {
        expect(resolveTateChuYokoMaxLength(undefined)).toBe(2);
        expect(resolveTateChuYokoMaxLength(true)).toBe(2);
        expect(resolveTateChuYokoMaxLength(false)).toBe(0);
        expect(resolveTateChuYokoMaxLength(3)).toBe(3);
        expect(resolveTateChuYokoMaxLength(Number.NaN)).toBe(0);
    });

    it("combines a short run and leaves a long one to the writing mode", () => {
        expect(segmentVerticalText("\u7B2C12\u8A71", 2)).toEqual([
            { text: "\u7B2C", combineUpright: false },
            { text: "12", combineUpright: true },
            { text: "\u8A71", combineUpright: false },
        ]);
        expect(segmentVerticalText("Prologue", 2)).toEqual([{ text: "Prologue", combineUpright: false }]);
        expect(segmentVerticalText("", 2)).toEqual([{ text: "", combineUpright: false }]);
    });

    it("wraps only the combined runs, and only while vertical", () => {
        expect(renderWordText("\u7B2C12\u8A71", false, true)).toBe("\u7B2C12\u8A71");
        expect(renderWordText("\u7B2C12\u8A71", true, false)).toBe("\u7B2C12\u8A71");
        expect(renderWordText("\u3053\u3093\u306B\u3061\u306F", true, true)).toBe("\u3053\u3093\u306B\u3061\u306F");

        const nodes = renderWordText("\u7B2C12\u8A71", true, true) as React.ReactElement[];
        expect(Array.isArray(nodes)).toBe(true);
        const combined = nodes.filter((node) => node.type === "span");
        expect(combined).toHaveLength(1);
        expect((combined[0].props as { style: React.CSSProperties }).style.textCombineUpright).toBe("all");
        expect((combined[0].props as { children: string }).children).toBe("12");
    });
});

/**
 * Splitting a word so its newest characters can fade in.
 *
 * The invariants worth stating, none of which are about the look of the fade:
 *
 * - text that is not fading comes back exactly as it did before this existed - one node - so a
 *   settled line and a line with the effect turned off are the same markup;
 * - a fading character is `display: inline`, which it is by default and must stay: an
 *   `inline-block` per character lets the line break between any two of them, which is what took
 *   Latin words apart the last time text was drawn one character at a time;
 * - a combined tate-chu-yoko run fades as one, because it is one glyph cluster set across the
 *   column and cannot be half-set;
 * - the key of a fading character does not move as the word grows, or React would remount it and
 *   its animation would start over on every keystroke.
 */
describe("reveal split", () => {
    const flat = (node: React.ReactNode): React.ReactElement[] =>
        (Array.isArray(node) ? node : [node]) as React.ReactElement[];

    it("returns the word untouched when nothing is fading", () => {
        expect(renderWordText("Prologue", false, true, 0)).toBe("Prologue");
        expect(renderWordText("Prologue", false, true)).toBe("Prologue");
    });

    it("gives each fading character an element and leaves the rest as one node", () => {
        const nodes = flat(renderWordText("abcde", false, undefined, 2));

        // The settled prefix, then one element per fading character.
        expect(nodes).toHaveLength(3);
        expect((nodes[0].props as { children: string }).children).toBe("abc");
        expect(nodes[1].props).toMatchObject({ className: "__narraleaf_text_reveal", children: "d" });
        expect(nodes[2].props).toMatchObject({ className: "__narraleaf_text_reveal", children: "e" });
    });

    it("never gives a fading character a display of its own", () => {
        const nodes = flat(renderWordText("abcde", false, undefined, 2));

        for (const node of nodes.slice(1)) {
            expect((node.props as { style?: React.CSSProperties }).style?.display).toBeUndefined();
        }
    });

    it("keys a fading character on its place in the word, so it survives the next keystroke", () => {
        // The same character, one keystroke apart: "d" is the fourth character either way, and its
        // element has to be recognised as the same one or its fade restarts.
        const before = flat(renderWordText("abcd", false, undefined, 2));
        const after = flat(renderWordText("abcde", false, undefined, 2));

        expect(before[before.length - 1].key).toBe("r3");
        expect(after[1].key).toBe("r3");
    });

    it("fades the whole word when the tail covers it", () => {
        const nodes = flat(renderWordText("ab", false, undefined, 5));

        expect(nodes).toHaveLength(2);
        expect(nodes.every((node) => (node.props as { className?: string }).className === "__narraleaf_text_reveal")).toBe(true);
    });

    it("keeps a combined vertical run together while it fades", () => {
        // The tail reaches into "12", which is set across the column as one thing. Splitting it
        // would lay the digits on their sides until they settled.
        const nodes = flat(renderWordText("\u7B2C12\u8A71", true, true, 3));
        const fading = nodes.filter((node) => (node.props as { className?: string }).className === "__narraleaf_text_reveal");

        expect(fading).toHaveLength(2);
        expect((fading[0].props as { children: string }).children).toBe("12");
        expect((fading[0].props as { style: React.CSSProperties }).style.textCombineUpright).toBe("all");
        expect((fading[1].props as { children: string }).children).toBe("\u8A71");
    });

    it("leaves the settled part of a vertical word combined", () => {
        const nodes = flat(renderWordText("\u7B2C12\u8A71", true, true, 1));
        const settled = flat((nodes[0].props as { children: React.ReactNode }).children);

        expect(settled.some((node) => node.type === "span"
            && (node.props as { children: string }).children === "12")).toBe(true);
    });

    it("does not cut a surrogate pair in half", () => {
        const nodes = flat(renderWordText("a\u{1F44D}", false, undefined, 2));

        expect(nodes).toHaveLength(2);
        expect((nodes[0].props as { children: string }).children).toBe("a");
        expect((nodes[1].props as { children: string }).children).toBe("\u{1F44D}");
    });
});
