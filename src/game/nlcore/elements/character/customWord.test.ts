import { describe, expect, it } from "vitest";
// Through the library entry, for the reason name.test.ts gives: reaching into the element modules
// directly pulls scene -> layer in an order that leaves `TransformState` uninitialized.
import { Sentence, Word } from "narraleaf-react";
import type { WordConfig } from "@core/elements/character/word";

/**
 * A custom-rendered word is an ordinary text word wearing a component.
 *
 * That is the whole design, and these tests hold the two halves of it apart. The word stays text:
 * it reaches the backlog and the read-text record through `Word.getText` like any other, because
 * the renderer rides in the config rather than replacing the payload the way `Pause` and
 * `TextEvent` do — both of which `getText` deliberately drops. And the renderer stays itself: it is
 * carried by reference through every copy the sentence pipeline makes, never merged.
 *
 * The second half is not decoration. Word config goes through `deepMerge` on construction, on
 * `copy` and on `assign`, and a component built by `React.memo` or `React.forwardRef` is a plain
 * object — exactly what `deepMerge` walks into and rebuilds. A rebuilt component is a different
 * element type to React, so the word would remount on every keystroke of the typewriter and any
 * state the renderer held (an open popup) would vanish as the player watched.
 */

/** Stands in for a component; identity is all these tests care about. */
const Renderer = () => null;

/**
 * Shaped like what `React.memo(...)` returns: a plain object literal, `constructor === Object`,
 * which is precisely the case `deepMerge` deep-copies.
 */
const memoLikeRenderer = {
    $$typeof: Symbol.for("react.memo"),
    type: Renderer,
    compare: null,
} as unknown as WordConfig["render"];

describe("custom word renderers", () => {
    it("keeps a custom word's text in the sentence's plain text", () => {
        const words = new Sentence([
            "今天的",
            Word.custom("以太浓度", Renderer, { data: { entry: "aether" } }),
            "高得反常。",
        ]).evaluate({} as never);

        expect(Word.getText(words)).toBe("今天的以太浓度高得反常。");
    });

    it("carries the renderer and its payload by reference", () => {
        const data = { entry: "aether" };
        const word = Word.custom("以太浓度", Renderer, { data });

        expect(word.config.render).toBe(Renderer);
        expect(word.config.data).toBe(data);
    });

    it("does not rebuild a memo-shaped component when the word is copied", () => {
        const word = new Word("以太浓度", { render: memoLikeRenderer });

        expect(word.config.render).toBe(memoLikeRenderer);
        expect(word.copy().config.render).toBe(memoLikeRenderer);
        expect(word.copy().copy().config.render).toBe(memoLikeRenderer);
    });

    it("keeps the renderer when the word is re-styled", () => {
        const word = Word.bold(Word.color(Word.custom("以太浓度", Renderer), "#f00"));

        expect(word.config.render).toBe(Renderer);
        expect(word.config.bold).toBe(true);
        expect(word.config.color).toBe("#f00");
    });

    it("re-renders an existing word without disturbing its styling", () => {
        const word = Word.custom(Word.color("以太浓度", "#f00"), Renderer);

        expect(word.config.render).toBe(Renderer);
        expect(word.config.color).toBe("#f00");
        expect(word.toString()).toBe("以太浓度");
    });

    it("does not let a word's renderer leak onto a word nested inside it", () => {
        const inner = new Word("以太浓度");
        inner.inherit({ render: Renderer, color: "#f00" });

        // Colour is inherited, identity is not: a word that already knows what it is must not be
        // re-clothed by the word that evaluated it.
        expect(inner.config.color).toBe("#f00");
        expect(inner.config.render).toBeUndefined();
    });

    it("gives a dynamic word's plain strings the renderer it was built with", () => {
        const word = Word.custom(
            (() => "以太浓度") as never,
            Renderer,
            { data: { entry: "aether" } }
        );
        const evaluated = word.evaluate({} as never);

        expect(evaluated).toHaveLength(1);
        expect(evaluated[0].config.render).toBe(Renderer);
        expect(evaluated[0].config.data).toEqual({ entry: "aether" });
    });

    it("survives the sentence pipeline with its renderer intact", () => {
        const data = { entry: "aether" };
        const words = new Sentence([
            "今天的",
            Word.custom("以太浓度", Renderer, { data }),
        ]).evaluate({} as never);

        const custom = words.filter(word => word.config.render);
        expect(custom).toHaveLength(1);
        expect(custom[0].config.render).toBe(Renderer);
        expect(custom[0].config.data).toBe(data);
    });
});
