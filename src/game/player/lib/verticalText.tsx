/**
 * Vertical typesetting helpers shared by the typewriter and the preview renderer.
 *
 * A vertical box is set the way a Japanese novel is: glyphs stand upright in a column that reads
 * top to bottom, and the next column starts to the left. Two things in that layout are not free,
 * and both are about text that is not Japanese:
 *
 * - A Latin word must stay whole. `word-break: break-all` would split "Prologue" across two
 *   columns, one glyph at a time, sideways. Neither writing mode needs it: `normal` already breaks
 *   between CJK characters, which is the only place either one has to break.
 * - A short run - a two-digit number, an initialism - reads better set upright across the column
 *   than laid on its side. That is tate-chu-yoko (縦中横), and CSS spells it
 *   `text-combine-upright: all` on a wrapper around exactly that run.
 */

import React from "react";
import { REVEAL_CLASS_NAME } from "@player/elements/say/textReveal";

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
 * How a word's own box breaks. The two writing modes want the same thing, which is why this takes
 * no argument: a column of Japanese breaks by the same rules a line of it does.
 *
 * `word-break: normal` already breaks between CJK characters, which is the only thing `break-all`
 * was ever here for, and it does not take a Latin word apart to do it. `break-all` means what it
 * says: it cut "NarraLeaf" and "English" wherever the line ran out.
 *
 * `line-break: strict` asks for the rest of the kinsoku set. The prohibitions everyone knows - no
 * line beginning with 、 。 」 ？ ！, none ending with 「 （ - are applied by the browser whatever
 * `word-break` says, and were never the thing at fault. `strict` adds what a printed book is set
 * to, holding back the small kana and the prolonged sound mark: over 301 container sizes, っ opened
 * a line in 20 of them set horizontally and a column in 18 set vertically, and none at all under
 * `strict`. It leaves the tate-chu-yoko runs below alone - a combined `12` measures the same
 * either way.
 *
 * Worth knowing before deleting it: `strict` does nothing unless the document declares a language.
 * Any `lang` will do - `en` is enough, and the shipped shell has one - but with no `lang` above the
 * text the strict rules are not applied and this reads as dead weight.
 *
 * `overflow-wrap: break-word` is the last resort, for a run that fits nowhere - a URL, a long
 * unspaced word in a narrow box - and it applies only after the line has been given its chance to
 * break somewhere legal.
 */
export function wordBreakStyleFor(): React.CSSProperties {
    return { wordBreak: "normal", lineBreak: "strict", overflowWrap: "break-word" };
}

function segmentsOf(text: string, vertical: boolean, tateChuYoko: TateChuYoko | undefined): VerticalTextSegment[] {
    const maxLength = vertical ? resolveTateChuYokoMaxLength(tateChuYoko) : 0;
    if (maxLength <= 0) {
        return [{ text, combineUpright: false }];
    }
    return segmentVerticalText(text, maxLength);
}

function renderSegments(segments: VerticalTextSegment[], keyPrefix: string): React.ReactNode {
    if (!segments.some((segment) => segment.combineUpright)) {
        return segments.map((segment) => segment.text).join("");
    }
    return segments.map((segment, index) => (
        segment.combineUpright
            ? <span key={`${keyPrefix}${index}`} style={{ textCombineUpright: "all" }}>{segment.text}</span>
            : <React.Fragment key={`${keyPrefix}${index}`}>{segment.text}</React.Fragment>
    ));
}

/**
 * The smallest pieces of a word that may fade in on their own.
 *
 * A character each, except where the text has already been combined: a tate-chu-yoko run is one
 * glyph cluster set across the column and has to arrive as one, or it would be laid on its side for
 * as long as its halves were fading separately. Characters are taken by code point rather than by
 * code unit so a surrogate pair is never cut in half.
 */
export function revealAtoms(segments: VerticalTextSegment[]): VerticalTextSegment[] {
    const atoms: VerticalTextSegment[] = [];
    for (const segment of segments) {
        if (segment.combineUpright) {
            atoms.push(segment);
            continue;
        }
        for (const character of segment.text) {
            atoms.push({ text: character, combineUpright: false });
        }
    }
    return atoms;
}

/**
 * Renders a word's text with its short runs set upright, and its newest characters still fading.
 *
 * Returns the string itself when nothing would be combined and nothing is fading, so horizontal
 * text - and vertical text with no Latin in it - is one text node, exactly as before.
 *
 * `revealTail` is how many of the word's trailing characters are still fading. Each of those gets
 * an element of its own so that mounting it starts its animation; everything before them is one
 * settled run again, which is what keeps the markup of a long line from growing with it. The
 * elements are `display: inline` - which they are by default, and which is the whole reason this
 * splits at all: an `inline-block` per character would let the line break between any two of them
 * and take a Latin word apart. Nothing here may be given a transform for the same reason.
 */
export function renderWordText(
    text: string,
    vertical: boolean,
    tateChuYoko: TateChuYoko | undefined,
    revealTail: number = 0,
): React.ReactNode {
    if (revealTail <= 0) {
        if (!vertical) {
            return text;
        }
        return renderSegments(segmentsOf(text, vertical, tateChuYoko), "");
    }

    const atoms = revealAtoms(segmentsOf(text, vertical, tateChuYoko));

    // Walk back from the end until the characters covered reach the tail, so the split never lands
    // inside an atom.
    let cut = atoms.length, remaining = revealTail;
    while (cut > 0 && remaining > 0) {
        cut--;
        remaining -= atoms[cut].text.length;
    }

    const nodes: React.ReactNode[] = [];
    if (cut > 0) {
        // Re-segmenting the settled prefix gives what this function would have returned for it on
        // its own: the cut fell on an atom boundary, so no combined run was split to get here.
        const settled = atoms.slice(0, cut).map((atom) => atom.text).join("");
        nodes.push(
            <React.Fragment key={"s"}>
                {renderSegments(segmentsOf(settled, vertical, tateChuYoko), "s")}
            </React.Fragment>
        );
    }
    for (let index = cut; index < atoms.length; index++) {
        const atom = atoms[index];
        nodes.push(
            // Keyed on the atom's place in the word, which does not move as the word grows: a
            // character keeps its element - and so its running animation - until it settles.
            <span
                key={`r${index}`}
                className={REVEAL_CLASS_NAME}
                style={atom.combineUpright ? { textCombineUpright: "all" } : undefined}
            >
                {atom.text}
            </span>
        );
    }
    return nodes;
}
