/**
 * Text reveal: the soft edge of the typewriter.
 *
 * With it on, a character does not appear at full strength — it fades in over a moment while the
 * typewriter moves on, so a few of the newest characters are always part-way in. The effect is
 * driven entirely by the typewriter's own cadence: a character's fade starts when its element is
 * mounted and runs as a one-shot CSS animation, so nothing here schedules anything.
 *
 * Two numbers come out of this module, and both exist to keep that cheap:
 *
 * - the duration a fade actually runs for, which is the authored one brought down to what fits
 *   between characters. A fade may last at most {@link MAX_REVEAL_INTERVALS} character intervals,
 *   so raising the typing speed shortens it rather than piling up half-lit characters;
 * - how many of the most recently revealed characters are still fading, which is how many of them
 *   have to be elements of their own. Everything before that is settled text and is drawn as it
 *   always was — one text node — so the line's markup is bounded whatever its length.
 *
 * The count carries one character of margin past the fade's own length, so a character is always
 * finished fading before it is folded back into the settled text and its element goes away. Losing
 * that margin is what a half-lit character snapping to full looks like.
 */

/**
 * The longest a fade may run, counted in the gap between two characters.
 *
 * It bounds two things at once: how many characters can be fading at any moment (and so how many
 * extra elements a line carries), and how far behind the typewriter the soft edge can trail before
 * it stops reading as the same line being typed.
 */
export const MAX_REVEAL_INTERVALS = 8;

/** The custom property the container writes the fade's length to. */
export const REVEAL_DURATION_VAR = "--nl-reveal-duration";

/**
 * The class a still-fading character carries.
 *
 * The animation is declared in the engine's stylesheet against this class rather than written into
 * each element's `style`: an inline animation shorthand that changed between two renders would be
 * a new animation on an element that is already running one, and the character would start over.
 * Reading the length from a custom property on the container leaves every character's own style
 * untouched for as long as it lives.
 */
export const REVEAL_CLASS_NAME = "__narraleaf_text_reveal";

export type RevealTiming = {
    /** How long one character's fade runs, in ms. `0` when nothing fades. */
    duration: number;
    /** How many of the most recently revealed characters are still fading. `0` when nothing does. */
    inFlight: number;
};

/** Nothing fades: the line is drawn exactly as it is without this feature. */
const REVEAL_OFF: RevealTiming = { duration: 0, inFlight: 0 };

/**
 * What the authored duration comes to at the speed the line is actually being typed at.
 *
 * @param authored the game's `textRevealDuration`, in ms
 * @param cps characters per second, from the player's preferences
 * @param gameSpeed the speed multiplier, from the player's preferences
 */
export function resolveRevealTiming(authored: number | undefined, cps: number, gameSpeed: number): RevealTiming {
    if (typeof authored !== "number" || !Number.isFinite(authored) || authored <= 0) {
        return REVEAL_OFF;
    }

    // The same expression the typewriter paces itself with, so the two cannot drift apart.
    const interval = 1000 / (Math.max(0.01, cps) * Math.max(0.01, gameSpeed));
    const duration = Math.min(authored, MAX_REVEAL_INTERVALS * interval);
    if (duration <= 0) {
        return REVEAL_OFF;
    }

    return {
        duration,
        inFlight: Math.ceil(duration / interval) + 1,
    };
}

/**
 * How many of a word's trailing characters are still fading.
 *
 * The fading characters are the last few of the *line*, so a word only holds some of them, and a
 * word the typewriter has long passed holds none. `offset` is where the word starts in the line,
 * counted the way the line counts its own revealed characters; `revealFrom` is the first character
 * of the word that was actually typed rather than landed in a run.
 */
export function revealTailFor(
    timing: RevealTiming,
    offset: number,
    length: number,
    revealed: number,
    revealFrom: number = 0,
): number {
    if (timing.inFlight <= 0 || length <= 0) {
        return 0;
    }
    const tailStart = revealed - timing.inFlight;
    const tail = Math.min(length, offset + length - tailStart);
    // Characters that landed in a run are settled however new they are, so the tail stops where
    // the typed part of the word begins. A skipped line has no typed part left and fades nothing.
    return Math.max(0, Math.min(tail, length - Math.max(0, revealFrom)));
}
