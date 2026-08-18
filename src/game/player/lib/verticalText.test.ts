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
     * The reason this file exists. Neither mode may use `break-all`, which cuts an English word in
     * half wherever the line runs out. Horizontal text asks for the strict kinsoku set on top -
     * the one that holds back the small kana - while vertical text takes the default, which is what
     * the tate-chu-yoko runs below are laid out against.
     */
    it("leaves a word whole and lets the browser break the line legally", () => {
        expect(wordBreakStyleFor(false)).toEqual({
            wordBreak: "normal",
            lineBreak: "strict",
            overflowWrap: "break-word",
        });
        expect(wordBreakStyleFor(true)).toEqual({ wordBreak: "normal", overflowWrap: "break-word" });
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
