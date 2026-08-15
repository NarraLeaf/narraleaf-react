/**
 * Vertical typesetting helpers shared by the typewriter and the preview renderer.
 *
 * A vertical box is set the way a Japanese novel is: glyphs stand upright in a column that reads
 * top to bottom, and the next column starts to the left. Two things in that layout are not free,
 * and both are about text that is not Japanese:
 *
 * - A Latin word must stay whole. `word-break: break-all`, which the horizontal renderer wants so
 *   that CJK wraps anywhere, will otherwise split "Prologue" across two columns, one glyph at a
 *   time, sideways.
 * - A short run - a two-digit number, an initialism - reads better set upright across the column
 *   than laid on its side. That is tate-chu-yoko (縦中横), and CSS spells it
 *   `text-combine-upright: all` on a wrapper around exactly that run.
 */

import React from "react";

export type TextWritingMode = "horizontal-tb" | "vertical-rl" | "vertical-lr";
export type TextGlyphOrientation = "mixed" | "upright" | "sideways";

/**
 * Tate-chu-yoko setting: `true` uses the typographic default of two characters, a number sets the
 * longest run to combine, and `false` turns it off.
 */
export type TateChuYoko = boolean | number;

export const DEFAULT_TATE_CHU_YOKO_MAX_LENGTH = 2;

export function isVerticalWritingMode(mode: TextWritingMode | undefined): boolean {
    return mode === "vertical-rl" || mode === "vertical-lr";
}

/** The longest run to combine, or 0 when tate-chu-yoko is off. */
export function resolveTateChuYokoMaxLength(setting: TateChuYoko | undefined): number {
    if (setting === false) {
        return 0;
    }
    if (typeof setting === "number") {
        return Number.isFinite(setting) ? Math.max(0, Math.round(setting)) : 0;
    }
    return DEFAULT_TATE_CHU_YOKO_MAX_LENGTH;
}

/**
 * The writing-mode half of the text container's style.
 *
 * `text-orientation` is only written while vertical, where it means something; in a horizontal box
 * it would sit in the inline style doing nothing.
 */
export function verticalContainerStyle(
    mode: TextWritingMode | undefined,
    orientation: TextGlyphOrientation | undefined,
): React.CSSProperties {
    if (!isVerticalWritingMode(mode)) {
        return mode ? { writingMode: mode } : {};
    }
    return {
        writingMode: mode,
        textOrientation: orientation ?? "mixed",
    };
}

export type VerticalTextSegment = {
    text: string;
    combineUpright: boolean;
};

/** Latin letters and digits, plus the punctuation that stays inside a run like `12.5` or `PC-98`. */
const TCY_RUN = /[0-9A-Za-z]+(?:[.:\-/][0-9A-Za-z]+)*/g;

/**
 * Splits text into the runs tate-chu-yoko combines and the text around them.
 *
 * A run longer than `maxLength` is left in the surrounding segment rather than cut down to fit:
 * a long English word belongs on its side, which is what the writing mode does with it anyway.
 */
export function segmentVerticalText(text: string, maxLength: number): VerticalTextSegment[] {
    if (maxLength <= 0) {
        return [{ text, combineUpright: false }];
    }
    const segments: VerticalTextSegment[] = [];
    let cursor = 0;
    TCY_RUN.lastIndex = 0;
    for (let match = TCY_RUN.exec(text); match; match = TCY_RUN.exec(text)) {
        if (match[0].length > maxLength) {
            continue;
        }
        if (match.index > cursor) {
            segments.push({ text: text.slice(cursor, match.index), combineUpright: false });
        }
        segments.push({ text: match[0], combineUpright: true });
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length || segments.length === 0) {
        segments.push({ text: text.slice(cursor), combineUpright: false });
    }
    return segments;
}

/**
 * How a word's own box breaks.
 *
 * Vertical text keeps `word-break: normal`, which still breaks between CJK characters - that rule
 * has never needed `break-all` - while leaving Latin words whole.
 */
export function wordBreakStyleFor(vertical: boolean): React.CSSProperties {
    return vertical ? { wordBreak: "normal", overflowWrap: "break-word" } : { wordBreak: "break-all" };
}

/**
 * Renders a word's text with its short runs set upright.
 *
 * Returns the string itself when nothing would be combined, so horizontal text - and vertical text
 * with no Latin in it - is one text node, exactly as before.
 */
export function renderWordText(text: string, vertical: boolean, tateChuYoko: TateChuYoko | undefined): React.ReactNode {
    if (!vertical) {
        return text;
    }
    const maxLength = resolveTateChuYokoMaxLength(tateChuYoko);
    if (maxLength <= 0) {
        return text;
    }
    const segments = segmentVerticalText(text, maxLength);
    if (!segments.some((segment) => segment.combineUpright)) {
        return text;
    }
    return segments.map((segment, index) => (
        segment.combineUpright
            ? <span key={index} style={{ textCombineUpright: "all" }}>{segment.text}</span>
            : <React.Fragment key={index}>{segment.text}</React.Fragment>
    ));
}
