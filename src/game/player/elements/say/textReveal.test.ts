import { describe, expect, it } from "vitest";
import { MAX_REVEAL_INTERVALS, resolveRevealTiming, revealTailFor } from "./textReveal";

/**
 * The arithmetic behind the soft edge of the typewriter.
 *
 * Two things are being protected here, and neither is the look of the effect:
 *
 * - a character must never be folded back into the settled text while it is still fading, because
 *   that is what a half-lit character snapping to full looks like. The property test below states
 *   it directly over a sweep of speeds rather than trusting the one worked example;
 * - the number of characters fading at once is bounded, because each of them costs an element on
 *   the line being typed. A line typed fast enough would otherwise carry one per character.
 */
describe("resolveRevealTiming", () => {
    it("is off unless a duration was asked for", () => {
        expect(resolveRevealTiming(0, 10, 1)).toEqual({ duration: 0, inFlight: 0 });
        expect(resolveRevealTiming(undefined, 10, 1)).toEqual({ duration: 0, inFlight: 0 });
        expect(resolveRevealTiming(-120, 10, 1)).toEqual({ duration: 0, inFlight: 0 });
        expect(resolveRevealTiming(Number.NaN, 10, 1)).toEqual({ duration: 0, inFlight: 0 });
        expect(resolveRevealTiming(Number.POSITIVE_INFINITY, 10, 1)).toEqual({ duration: 0, inFlight: 0 });
    });

    it("keeps the authored duration while it fits between characters", () => {
        // 10 characters a second is a character every 100ms, so a 120ms fade trails one character
        // behind - itself, the one before it, and the margin.
        expect(resolveRevealTiming(120, 10, 1)).toEqual({ duration: 120, inFlight: 3 });
    });

    it("brings the fade down to what the typing speed leaves room for", () => {
        // A character every 5ms cannot carry a 400ms fade: it would be 80 characters deep. The cap
        // is what the player asking for fast text gets - a fade too short to be worth seeing.
        const timing = resolveRevealTiming(400, 200, 1);

        expect(timing.duration).toBe(MAX_REVEAL_INTERVALS * 5);
        expect(timing.inFlight).toBe(MAX_REVEAL_INTERVALS + 1);
    });

    it("reads game speed the way the typewriter does", () => {
        // Twice the speed is half the interval, which is the same as twice the characters per
        // second. The typewriter divides by the product, so this must too.
        expect(resolveRevealTiming(120, 10, 2)).toEqual(resolveRevealTiming(120, 20, 1));
    });

    it("never folds a character back before its fade has finished", () => {
        for (const authored of [1, 40, 120, 250, 400, 1000, 5000]) {
            for (const cps of [0.5, 1, 5, 10, 30, 60, 120, 500]) {
                for (const gameSpeed of [0.5, 1, 2, 5]) {
                    const timing = resolveRevealTiming(authored, cps, gameSpeed);
                    const interval = 1000 / (cps * gameSpeed);

                    // A character settles once `inFlight` more have been revealed after it, which
                    // takes that many intervals. It must not be less than the fade it is running.
                    expect(timing.inFlight * interval).toBeGreaterThanOrEqual(timing.duration);
                    expect(timing.inFlight).toBeLessThanOrEqual(MAX_REVEAL_INTERVALS + 1);
                }
            }
        }
    });

    it("survives a nonsense speed rather than dividing by zero", () => {
        expect(Number.isFinite(resolveRevealTiming(120, 0, 0).duration)).toBe(true);
        expect(Number.isFinite(resolveRevealTiming(120, 0, 0).inFlight)).toBe(true);
    });
});

describe("revealTailFor", () => {
    const timing = { duration: 120, inFlight: 3 };

    it("fades nothing while the effect is off", () => {
        expect(revealTailFor({ duration: 0, inFlight: 0 }, 0, 5, 5)).toBe(0);
    });

    it("leaves a word the typewriter has long passed alone", () => {
        // Five characters revealed, the newest three fading: a word ending at character 2 is
        // settled text and is drawn as one node.
        expect(revealTailFor(timing, 0, 2, 5)).toBe(0);
    });

    it("fades the whole of a word that is entirely among the newest characters", () => {
        expect(revealTailFor(timing, 3, 2, 5)).toBe(2);
    });

    it("splits a word the line's newest characters run into", () => {
        // One word holding the whole line - the shape an unstyled line actually has - has its last
        // three characters fading and the rest settled.
        expect(revealTailFor(timing, 0, 10, 10)).toBe(3);
    });

    it("never asks for more than the word has", () => {
        expect(revealTailFor({ duration: 120, inFlight: 9 }, 0, 2, 2)).toBe(2);
    });

    it("has nothing to say about an empty word", () => {
        expect(revealTailFor(timing, 4, 0, 4)).toBe(0);
    });
});
