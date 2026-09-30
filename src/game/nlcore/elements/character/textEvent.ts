import type { Color, ImageSrc } from "@core/types";
import type { Image } from "@core/elements/displayable/image";
import type { Sound } from "@core/elements/sound";

/**
 * The appearance a text-event may switch a character/image to when the typewriter reaches it.
 * Mirrors the runtime forms {@link Image.char} accepts: a tag list (array), or a static
 * `src`/`Color`. A bare string is treated as a `src` (as with `char`), so tag switches must be an
 * array (e.g. `["happy"]`).
 */
export type TextEventAppearance = ImageSrc | Color | string[];

/**
 * A character-expression effect: switch `image` to `appearance` (no transition — the swap is
 * instant, applied directly to the element the moment the typewriter reveals this point).
 */
export type TextEventExpression = {
    image: Image;
    appearance: TextEventAppearance;
};

/**
 * The (deliberately restricted) closed set of effects a first-version text-event may carry:
 * a character-expression switch and/or a sound effect. It is NOT a general action escape hatch —
 * the effect is applied directly to element state, never pushed onto the execution stack.
 */
export type TextEventConfig = {
    expression?: TextEventExpression;
    sound?: Sound;
};

/**
 * An inline dialogue token that fires a restricted side effect when the typewriter reveals it —
 * the text analogue of {@link Pause}. Unlike a normal {@link Word} it renders nothing; unlike an
 * action it never enters the stack model, so it adds no save burden. Its effect rides on the
 * ordinary element state (which IS serialized) and re-fires naturally when the owning `say` action
 * is re-evaluated.
 *
 * First version carries a closed set: a character-expression switch and/or a sound effect.
 *
 * **Skip / instant reveal semantics.** Skipping the typewriter — or an instant, non-type-effect
 * reveal that uncovers the whole sentence at once — does not drop the tokens it flies past. Every
 * crossed token fires exactly once, in source order, so the outcome is identical to letting the
 * typewriter reach each one in turn: the image ends in the appearance the *last* crossed token
 * specifies, and each crossed sound effect plays once. Re-visiting an already-fired token within the
 * same reveal is a no-op — it never double-plays a sound effect nor re-writes the expression — which
 * is what keeps a re-mount of an already-revealed line from replaying its effects.
 *
 * @example
 * ```ts
 * // switch Alice's portrait to "angry" the moment the typewriter reaches this point
 * character.say(["Don't ", TextEvent.expression(alice, ["angry"]), "test me."]);
 * // play a sting, no expression change
 * character.say(["...", TextEvent.sound(sting)]);
 * ```
 */
export class TextEvent {
    /**@internal */
    static isTextEvent(obj: unknown): obj is TextEvent {
        return obj instanceof TextEvent;
    }

    /**
     * Build a text-event that switches an image's appearance (a character portrait/expression)
     * when the typewriter reveals it, optionally alongside a sound effect.
     * @param image - The image whose appearance is switched.
     * @param appearance - Tag list (e.g. `["happy"]`) or a static `src`/`Color`.
     * @param options - Optional extras; `sound` plays a sound effect at the same point.
     */
    public static expression(
        image: Image,
        appearance: TextEventAppearance,
        options: { sound?: Sound } = {}
    ): TextEvent {
        return new TextEvent({ expression: { image, appearance }, sound: options.sound });
    }

    /**
     * Build a text-event that only plays a sound effect when the typewriter reveals it.
     * @param sound - The sound effect to play.
     */
    public static sound(sound: Sound): TextEvent {
        return new TextEvent({ sound });
    }

    /**@internal */
    public readonly config: TextEventConfig;

    /**
     * Build a text-event from an explicit effect descriptor. Prefer the {@link TextEvent.expression}
     * / {@link TextEvent.sound} factories for the common cases.
     * @param config - The closed-set effect descriptor.
     */
    constructor(config: TextEventConfig) {
        this.config = config;
    }
}
