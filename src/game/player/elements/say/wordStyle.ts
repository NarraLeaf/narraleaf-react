import type React from "react";
import type { WordConfig, WordEmphasis } from "@core/elements/character/word";
import { scaledFontSize } from "./autoFit";

/**
 * The size one word of a line is set at.
 *
 * A word sized in absolute units goes through the line's scale multiplier like every other length
 * in the line. A word sized as a share of the line does not: `em` already resolves against the
 * line's own size, which the multiplier has been applied to, so scaling it a second time would
 * bring the word down twice for every step the line comes down.
 */
export function wordFontSize(
    config: Partial<WordConfig>,
    sentenceFontSize: React.CSSProperties["fontSize"],
): React.CSSProperties["fontSize"] {
    if (config.fontSize !== undefined) {
        return scaledFontSize(config.fontSize);
    }
    if (config.fontScale !== undefined) {
        return relativeFontSize(config.fontScale);
    }
    return scaledFontSize(sentenceFontSize);
}

/**
 * The same rule where no scaling is in play — the sample line a settings screen types out has no box
 * to fit itself into.
 */
export function previewWordFontSize(
    config: Partial<WordConfig>,
    sentenceFontSize: React.CSSProperties["fontSize"],
): React.CSSProperties["fontSize"] {
    if (config.fontSize !== undefined) {
        return config.fontSize;
    }
    if (config.fontScale !== undefined) {
        return relativeFontSize(config.fontScale);
    }
    return sentenceFontSize;
}

function relativeFontSize(scale: number): string {
    return `${scale}em`;
}

/**
 * The emphasis marks a word carries, as the two declarations that draw them.
 *
 * The position keyword for vertical writing is always `right`: `over` and `under` are read only in
 * horizontal writing, and both Japanese and Chinese set the marks on the right of a vertical column.
 */
export function emphasisStyle(emphasis: WordEmphasis | undefined): React.CSSProperties {
    if (!emphasis) {
        return {};
    }
    return {
        textEmphasis: `${emphasis.fill ?? "filled"} ${emphasis.mark ?? "dot"}`,
        textEmphasisPosition: `${emphasis.position ?? "over"} right`,
    };
}
