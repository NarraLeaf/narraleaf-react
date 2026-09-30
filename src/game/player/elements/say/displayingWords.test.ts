import { describe, expect, it } from "vitest";
import { appendDisplayingWord } from "@player/elements/say/Sentence";
import { resolveRevealTiming, revealTailFor } from "@player/elements/say/textReveal";

/**
 * What the line is holding, and which of it is allowed to fade.
 *
 * The case this file exists for: a skip lands the whole rest of the line in one render, and every
 * character of it mounts at that moment. Mounting is what starts a fade, so a line that arrived
 * because the player asked for it *now* would otherwise appear at once and then fade its last few
 * characters in behind itself - the more so the longer the fade is set, which is how it was found.
 */

type Fragment = { text: string, full: string, config: Record<string, never>, tag: number, tag2: number };

function char(text: string, tag: number, index: number, full = text): Fragment {
    return { text, full, config: {}, tag, tag2: index };
}

/** Types `text` one character at a time, the way the typewriter does. */
function type(prev: any[], text: string, tag: number, from = 0): any[] {
    let line = prev;
    for (let i = 0; i < text.length; i++) {
        line = appendDisplayingWord(line, char(text[i], tag, from + i, text) as never);
    }
    return line;
}

/** Lands `text` all at once, the way a skip does. */
function land(prev: any[], text: string, tag: number, from = 0): any[] {
    let line = prev;
    for (let i = 0; i < text.length; i++) {
        line = appendDisplayingWord(line, char(text[i], tag, from + i, text) as never, true);
    }
    return line;
}

describe("appendDisplayingWord", () => {
    it("merges characters of one word into one fragment, as it always did", () => {
        const line = type([], "abc", 0);

        expect(line).toHaveLength(1);
        expect((line[0] as Fragment).text).toBe("abc");
    });

    it("leaves typed characters free to fade", () => {
        const line = type([], "abc", 0);

        expect((line[0] as { revealFrom?: number }).revealFrom).toBe(0);
    });

    it("marks characters that landed in a run as already settled", () => {
        const line = land([], "abc", 0);

        expect((line[0] as { revealFrom?: number }).revealFrom).toBe(3);
    });

    it("settles the typed part of a word too when the rest of it lands at once", () => {
        // Typed three characters, then the player skipped: the three that were still fading are
        // part of the line that just appeared, and go to full strength with it.
        const line = land(type([], "abc", 0), "defghi", 0, 3);

        expect((line[0] as Fragment).text).toBe("abcdefghi");
        expect((line[0] as { revealFrom?: number }).revealFrom).toBe(9);
    });

    it("keeps a line break out of it", () => {
        const line = appendDisplayingWord(type([], "ab", 0), "\n" as never, true);

        expect(line[line.length - 1]).toBe("\n");
    });

    it("settles every word a run passes through, not only the last", () => {
        const line = land(land([], "ab", 0), "cd", 1);

        expect(line).toHaveLength(2);
        for (const word of line as Fragment[]) {
            expect((word as { revealFrom?: number }).revealFrom).toBe(word.text.length);
        }
    });

    it("goes back to fading once the typewriter starts again", () => {
        // A skip that stops at a pause settles what it landed; what is typed after it is new text
        // arriving one character at a time, and fades like any other.
        const line = type(land([], "ab", 0), "cd", 1);

        expect((line[0] as { revealFrom?: number }).revealFrom).toBe(2);
        expect((line[1] as { revealFrom?: number }).revealFrom).toBe(0);
    });
});

describe("a skipped line fades nothing", () => {
    // The shape the bug was seen in: a long fade, and a line completed in one press.
    const timing = resolveRevealTiming(400, 10, 1);

    it("would fade the end of the line without the mark", () => {
        expect(timing.inFlight).toBeGreaterThan(1);
        expect(revealTailFor(timing, 0, 30, 30, 0)).toBe(timing.inFlight);
    });

    it("fades nothing once the line is known to have landed at once", () => {
        const line = land([], "the rest of the line, all at once", 0);
        const word = line[0] as Fragment & { revealFrom: number };

        expect(revealTailFor(timing, 0, word.text.length, word.text.length, word.revealFrom)).toBe(0);
    });

    it("still fades the characters the typewriter is putting down", () => {
        const line = type([], "typed one at a time", 0);
        const word = line[0] as Fragment & { revealFrom: number };

        expect(revealTailFor(timing, 0, word.text.length, word.text.length, word.revealFrom))
            .toBe(timing.inFlight);
    });
});
