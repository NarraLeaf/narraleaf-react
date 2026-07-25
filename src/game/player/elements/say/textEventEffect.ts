import type { GameState } from "@player/gameState";
import type { TextEvent } from "@core/elements/character/textEvent";
import type { Word } from "@core/elements/character/word";
import type { Pausing } from "@core/elements/character/pause";
import { Image } from "@core/elements/displayable/image";
import { ExposedStateType } from "@player/type";

/**
 * Apply a {@link TextEvent}'s effect directly to element state — no transition, no action history,
 * no stack model. This is the "reveal semantics" seam: the typewriter calls it the moment it
 * uncovers a token. Because the effect lands on ordinary element state (which IS serialized) and
 * never enters the stack model, it adds no save burden and re-fires naturally when the owning
 * `say` action is re-evaluated.
 *
 * Mirrors {@link ImageAction}'s non-transition branch for the repaint (layered image → `flush`,
 * otherwise → `updateStyleSync`).
 */
export function dispatchTextEvent(event: TextEvent, state: GameState): void {
    const { expression, sound } = event.config;

    if (expression) {
        const { image, appearance } = expression;
        image._setAppearanceSync(appearance);

        state.stage.update();
        const exposed = state.getExposedState<ExposedStateType.image>(image);
        if (exposed) {
            if (Image.isLayeredSrc(image)) {
                exposed.flush();
            } else {
                exposed.updateStyleSync();
            }
        }
    }

    if (sound) {
        // Fire-and-forget SE: momentary, no await, no history, no stack. It is not restored on
        // load (a spent sound has no lingering state) but re-fires on say re-evaluation.
        state.audioManager.play(sound, { end: sound.state.volume, duration: 0 });
    }
}

/**
 * Fire a {@link TextEvent} at most once for a given typewriter run. `fired` is the per-run guard
 * (contract 5): a render re-entry that re-visits the same token is a no-op, but a fresh run —
 * a replay of the same `say` — starts with an empty set and fires again (contract 4).
 */
export function fireTextEventOnce(event: TextEvent, fired: Set<TextEvent>, state: GameState): void {
    if (fired.has(event)) {
        return;
    }
    fired.add(event);
    dispatchTextEvent(event, state);
}

/**
 * Land the final state of an instantly-revealed sentence: every {@link TextEvent} token in `words`
 * fires once, in source order — the same "final state" a typewriter skip produces (contract 3).
 *
 * `fired` is the persistent per-reveal guard. Pass the SAME set across re-mounts of one dialog line
 * (e.g. an NVL entry re-keyed on a phase/active change, or the whole container re-mounting) so the
 * re-mount replays neither the sound effects nor the — now stale — expression writes. A genuinely
 * fresh reveal (a new line, or a `say` re-evaluated on load) passes its own empty set and fires
 * again, preserving replay safety (contract 4). Returns the tokens that actually fired this call
 * (empty on a guarded re-mount), for tests.
 */
export function fireInstantRevealEvents(
    words: readonly Word<string | Pausing | TextEvent>[],
    fired: Set<TextEvent>,
    state: GameState
): TextEvent[] {
    const firedNow: TextEvent[] = [];
    for (const word of words) {
        if (word.isTextEvent()) {
            const event = word.text;
            if (!fired.has(event)) {
                firedNow.push(event);
            }
            fireTextEventOnce(event, fired, state);
        }
    }
    return firedNow;
}
