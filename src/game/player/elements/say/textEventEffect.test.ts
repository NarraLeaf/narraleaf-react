import { describe, expect, it, vi } from "vitest";
// Entry import keeps the element init order correct (see imageAction.setAppearance.test.ts).
import { Image, Sentence, Sound, TextEvent } from "narraleaf-react";
import { dispatchTextEvent, fireTextEventOnce } from "./textEventEffect";

function tagImage() {
    return new Image({
        src: {
            groups: [["normal", "happy", "angry"], ["school", "casual"]],
            defaults: ["normal", "school"],
            resolve: (emotion: string, outfit: string) => `/assets/${emotion}-${outfit}.png`,
        },
    } as never);
}

function fakeState() {
    const updateStyleSync = vi.fn();
    const flush = vi.fn();
    const update = vi.fn();
    const play = vi.fn();
    const state = {
        stage: { update },
        getExposedState: () => ({ updateStyleSync, flush }),
        audioManager: { play },
    };
    return { state, updateStyleSync, flush, update, play };
}

describe("dispatchTextEvent — expression effect (contract 2)", () => {
    it("mutates the target image state and repaints, without any action/history", () => {
        const img = tagImage();
        const { state, update, updateStyleSync } = fakeState();

        dispatchTextEvent(TextEvent.expression(img, ["happy"]), state as never);

        expect(img.state.currentSrc).toEqual(["happy", "school"]);
        expect(update).toHaveBeenCalledTimes(1);
        expect(updateStyleSync).toHaveBeenCalledTimes(1);
    });
});

describe("dispatchTextEvent — sound effect", () => {
    it("plays the SE fire-and-forget", () => {
        const se = Sound.sound("/se.mp3");
        const { state, play } = fakeState();

        dispatchTextEvent(TextEvent.sound(se), state as never);

        expect(play).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalledWith(se, expect.objectContaining({ duration: 0 }));
    });

    it("an expression event may also carry an SE", () => {
        const img = tagImage();
        const se = Sound.sound("/se.mp3");
        const { state, play, update } = fakeState();

        dispatchTextEvent(TextEvent.expression(img, ["angry"], { sound: se }), state as never);

        expect(img.state.currentSrc).toEqual(["angry", "school"]);
        expect(update).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalledTimes(1);
    });
});

describe("fireTextEventOnce — idempotency gate", () => {
    it("fires a token at most once for a run (contract 5: no double-trigger on re-entry)", () => {
        const { state, update } = fakeState();
        const ev = TextEvent.expression(tagImage(), ["happy"]);
        const fired = new Set<TextEvent>();

        fireTextEventOnce(ev, fired, state as never);
        fireTextEventOnce(ev, fired, state as never); // a render re-visit is a no-op

        expect(update).toHaveBeenCalledTimes(1);
    });

    it("a fresh run re-fires the same token (contract 4: replay safety)", () => {
        const { state, update } = fakeState();
        const ev = TextEvent.expression(tagImage(), ["happy"]);

        fireTextEventOnce(ev, new Set<TextEvent>(), state as never);
        fireTextEventOnce(ev, new Set<TextEvent>(), state as never); // a say replay starts empty

        expect(update).toHaveBeenCalledTimes(2);
    });
});

describe("skip lands the final state (contract 3)", () => {
    it("crossing every remaining token fires each effect exactly once, in order", () => {
        // Emulates trySkip(untilEnd) / the instant-reveal path: every crossed token fires. This is
        // the exact sequence the typewriter walks — evaluate() lays the tokens out in reading order.
        const imgA = tagImage();
        const imgB = tagImage();
        const evA = TextEvent.expression(imgA, ["happy"]);
        const evB = TextEvent.expression(imgB, ["angry"]);
        const words = new Sentence(["a", evA, "b", evB, "c"]).evaluate({} as never);

        const { state } = fakeState();
        const fired = new Set<TextEvent>();
        for (const word of words) {
            if (word.isTextEvent()) {
                fireTextEventOnce(word.text, fired, state as never);
            }
        }

        expect(imgA.state.currentSrc).toEqual(["happy", "school"]);
        expect(imgB.state.currentSrc).toEqual(["angry", "school"]);
        expect(fired.size).toBe(2);
    });

    it("a token switching the same image twice ends on the last appearance", () => {
        const img = tagImage();
        const first = TextEvent.expression(img, ["happy"]);
        const second = TextEvent.expression(img, ["angry"]);
        const words = new Sentence(["x", first, "y", second]).evaluate({} as never);

        const { state } = fakeState();
        const fired = new Set<TextEvent>();
        for (const word of words) {
            if (word.isTextEvent()) {
                fireTextEventOnce(word.text, fired, state as never);
            }
        }

        expect(img.state.currentSrc).toEqual(["angry", "school"]);
    });
});
