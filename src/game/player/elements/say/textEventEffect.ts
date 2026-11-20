import type { GameState } from "@player/gameState";
import type { TextEvent } from "@core/elements/character/textEvent";
import type { Word } from "@core/elements/character/word";
import type { Pausing } from "@core/elements/character/pause";
import type { ImageTransition } from "@core/elements/transition/transitions/image/imageTransition";
import type { Color, ImageSrc } from "@core/types";
import { Image } from "@core/elements/displayable/image";
import { Utils } from "@core/common/Utils";
import { ExposedStateType } from "@player/type";

export type DispatchTextEventOptions = {
    /**
     * Play the expression's transition, if it has one. Only the typewriter reaching the token asks
     * for it; a skip or an instant reveal lands the swap at once, as it lands the rest of the line.
     */
    animate?: boolean;
};

/**
 * What a non-layered image is painting now, as a transition takes its sources: the url its tags or
 * src resolve to. The same answer `ImageAction.resolveCurrentSrc` gives, kept here so the player
 * does not reach into the action module.
 */
function paintedSrc(image: Image): Color | ImageSrc {
    if (Image.isStaticSrc(image)) {
        const src = image.state.currentSrc as Color | ImageSrc;
        return Utils.isImageSrc(src) ? Utils.srcToURL(src) : src;
    }
    if (Image.isTagSrc(image) && image.config.src.resolve) {
        return Image.getSrcFromTags(image.state.currentSrc as string[], image.config.src.resolve);
    }
    throw image._mixedSrcError();
}

/**
 * Apply a {@link TextEvent}'s effect directly to element state — no action history, no stack
 * model. This is the "reveal semantics" seam: the typewriter calls it the moment it uncovers a
 * token. Because the effect lands on ordinary element state (which IS serialized) and never enters
 * the stack model, it adds no save burden and re-fires naturally when the owning `say` action is
 * re-evaluated.
 *
 * The state changes at once in every case. A transition, when the token carries one and `animate`
 * asks for it, only draws the change: it is handed the image's sources from before and after, the
 * way `ImageAction` hands them to a `char` transition, so a save taken while it plays holds the new
 * appearance. Without one the repaint mirrors {@link ImageAction}'s non-transition branch (layered
 * image → `flush`, otherwise → `updateStyleSync`).
 */
export function dispatchTextEvent(event: TextEvent, state: GameState, options: DispatchTextEventOptions = {}): void {
    const { expression, sound } = event.config;

    if (expression) {
        const { image, appearance } = expression;
        const exposed = state.getExposedState<ExposedStateType.image>(image);
        // A copy, as `char` takes one: the token fires again on every replay of its line, and the
        // sources set below belong to this swap only. An image not on stage has nothing to draw.
        const transition = options.animate && exposed
            ? expression.transition?.copy() as ImageTransition | undefined
            : undefined;
        const layered = Image.isLayeredSrc(image);

        if (transition) {
            if (layered) {
                transition._setPrevLayers(Image.getSrcURLs(image));
            } else {
                transition._setPrevSrc(paintedSrc(image));
            }
        }

        image._setAppearanceSync(appearance);
        state.stage.update();

        if (transition && exposed) {
            if (layered) {
                transition._setTargetLayers(Image.getSrcURLs(image));
            } else {
                transition._setTargetSrc(paintedSrc(image));
            }
            // The image paints the transition's two sources while it runs and its settled state
            // once it ends, so nothing is left to repaint here. A transition already running on the
            // image (the previous token's) is completed by `applyTransition` before this one starts.
            exposed.applyTransition(transition, () => undefined);
        } else if (exposed) {
            if (layered) {
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
 * a replay of the same `say` — starts with an empty set and fires again (contract 4). `options`
 * goes to {@link dispatchTextEvent}; only the typewriter reaching the token animates it.
 */
export function fireTextEventOnce(
    event: TextEvent,
    fired: Set<TextEvent>,
    state: GameState,
    options: DispatchTextEventOptions = {}
): void {
    if (fired.has(event)) {
        return;
    }
    fired.add(event);
    dispatchTextEvent(event, state, options);
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
