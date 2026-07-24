import { describe, expect, it } from "vitest";
// Imported through the entry: reaching into the element modules directly pulls scene -> layer in
// an order that leaves `TransformState` uninitialized (see imageAction.setAppearance.test.ts).
import { Image, Sentence, Sound, TextEvent, Word } from "narraleaf-react";

function tagImage() {
    return new Image({
        src: {
            groups: [["normal", "happy", "angry"], ["school", "casual"]],
            defaults: ["normal", "school"],
            resolve: (emotion: string, outfit: string) => `/assets/${emotion}-${outfit}.png`,
        },
    } as never);
}

describe("TextEvent — construction (restricted closed set)", () => {
    it("expression() carries the image + appearance", () => {
        const img = tagImage();
        const ev = TextEvent.expression(img, ["happy"]);
        expect(TextEvent.isTextEvent(ev)).toBe(true);
        expect(ev.config.expression).toEqual({ image: img, appearance: ["happy"] });
        expect(ev.config.sound).toBeUndefined();
    });

    it("expression() accepts an optional sound effect", () => {
        const se = Sound.sound("/se.mp3");
        const ev = TextEvent.expression(tagImage(), ["angry"], { sound: se });
        expect(ev.config.expression?.appearance).toEqual(["angry"]);
        expect(ev.config.sound).toBe(se);
    });

    it("sound() is a sound-effect-only event", () => {
        const se = Sound.sound("/se.mp3");
        const ev = TextEvent.sound(se);
        expect(ev.config.expression).toBeUndefined();
        expect(ev.config.sound).toBe(se);
    });

    it("isTextEvent rejects non-tokens", () => {
        expect(TextEvent.isTextEvent("hello")).toBe(false);
        expect(TextEvent.isTextEvent({ expression: {} })).toBe(false);
        expect(TextEvent.isTextEvent(null)).toBe(false);
    });
});

describe("TextEvent — enters the word stream like Pause", () => {
    it("survives Sentence formatting/evaluation as a non-text word", () => {
        const ev = TextEvent.expression(tagImage(), ["happy"]);
        const words = new Sentence(["Hi ", ev, "there"]).evaluate({} as never);

        const tokens = words.filter((w) => w.isTextEvent());
        expect(tokens).toHaveLength(1);
        expect(tokens[0].text).toBe(ev);

        // The token contributes no glyphs: getText walks past it just like a Pause.
        expect(Word.getText(words)).toBe("Hi there");
    });

    it("does not serialize with the sentence (zero save burden)", () => {
        const s = new Sentence(["Hi ", TextEvent.expression(tagImage(), ["happy"])]);
        expect(s.toData()).toBeNull();
    });
});

describe("Image._setAppearanceSync — direct state mutation (no history, no stack)", () => {
    it("resolves a tag switch against the current appearance", () => {
        const img = tagImage();
        expect(img.state.currentSrc).toEqual(["normal", "school"]);

        img._setAppearanceSync(["happy"]);
        expect(img.state.currentSrc).toEqual(["happy", "school"]);

        // A partial switch replaces only its own group.
        img._setAppearanceSync(["casual"]);
        expect(img.state.currentSrc).toEqual(["happy", "casual"]);
    });

    it("replaces the src for a static image", () => {
        const img = new Image({ src: "/a.png" } as never);
        img._setAppearanceSync("/b.png");
        expect(img.state.currentSrc).toBe("/b.png");
    });
});

describe("TextEvent effect rides on element state, not the save (contract 4)", () => {
    it("a switched appearance survives a serialize/deserialize round-trip", () => {
        const img = tagImage();
        img._setAppearanceSync(["happy"]);
        expect(img.state.currentSrc).toEqual(["happy", "school"]);

        // The token itself is never in the save — only the ordinary image state is.
        const restored = tagImage().fromData(img.toData());
        expect(restored.state.currentSrc).toEqual(["happy", "school"]);
    });

    it("re-applying the same effect after load lands the same state (idempotent replay)", () => {
        const img = tagImage();
        img._setAppearanceSync(["happy"]);
        const restored = tagImage().fromData(img.toData());

        // A load re-runs the say action, which re-fires the token; re-applying is consistent.
        restored._setAppearanceSync(["happy"]);
        expect(restored.state.currentSrc).toEqual(["happy", "school"]);
    });

    // A save taken part-way through a sentence must restore exactly the appearance the last revealed
    // token produced — no more, no less — and re-loading the say must walk forward consistently.
    // `toData`/`fromData` here is the very per-element unit `LiveGame.serializeGameState()` collects
    // through `story.getAllElementStates()` and `deserialize()` restores element-by-element, so this
    // exercises the same save/load path a mid-sentence save hits, without a full-game harness.
    it("a save mid-sentence restores the last-revealed appearance, and the re-loaded say advances cleanly (contract 5d)", () => {
        const img = tagImage();
        const first = TextEvent.expression(img, ["happy"]);
        const second = TextEvent.expression(img, ["angry"]);
        new Sentence(["a", first, "b", second]).evaluate({} as never);

        // Typewriter revealed the first token, then paused before the second — this is the save point.
        img._setAppearanceSync(first.config.expression!.appearance);
        expect(img.state.currentSrc).toEqual(["happy", "school"]);

        // Save → load: only the ordinary image state travels; it carries the mid-sentence appearance
        // (the second token has NOT been reached, so "angry" is not in the save).
        const restored = tagImage().fromData(img.toData());
        expect(restored.state.currentSrc).toEqual(["happy", "school"]);

        // Advancing the re-loaded say to the second token lands its final state.
        restored._setAppearanceSync(second.config.expression!.appearance);
        expect(restored.state.currentSrc).toEqual(["angry", "school"]);
    });
});
