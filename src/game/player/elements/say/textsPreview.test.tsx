import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TextsPreview } from "@player/elements/say/Sentence";

/**
 * The settings-screen sample line is a second renderer over the same words, and every word-level
 * feature has to be added to both (a size or a mark written into only one of them shows up in the
 * game and not in the sample that is meant to show the game).
 *
 * Only the first render is reachable without a DOM - the typing itself is an effect - so what is
 * pinned here is the gate: a sample that is not typing draws its text as one node, exactly as it
 * did before the reveal effect existed. Outside a `GameProvider` the game's own setting is its
 * default, which is off.
 */
describe("TextsPreview", () => {
    it("draws a sample that is not typing as plain text", () => {
        const markup = renderToStaticMarkup(
            <TextsPreview text={"\u4EE5\u592A\u6D53\u5EA6"} useTypeEffect={false} loop={false} />
        );

        expect(markup).toContain("\u4EE5\u592A\u6D53\u5EA6");
        expect(markup).not.toContain("__narraleaf_text_reveal");
    });

    it("has nothing on screen before the typing starts", () => {
        const markup = renderToStaticMarkup(
            <TextsPreview text={"\u4EE5\u592A\u6D53\u5EA6"} useTypeEffect={true} loop={false} />
        );

        expect(markup).not.toContain("\u4EE5\u592A");
        expect(markup).not.toContain("__narraleaf_text_reveal");
    });
});
