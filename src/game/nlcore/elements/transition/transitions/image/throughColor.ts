import {CSSProps, TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Image} from "@core/elements/displayable/image";
import {clamp01, overlayBase} from "@core/elements/transition/transitions/image/transitionMaskUtils";
import {Mask, MaskPattern} from "@core/elements/transition/transitions/image/mask";

type AnimationType = [TransitionAnimationType.Number];

/**
 * How the colour uncovers after the hold:
 * - `"retreat"` — the cover pattern backs out the way it came (default).
 * - `"continue"` — the edge keeps travelling in the same direction, so the
 *   pattern passes *through* the frame (a wipe exits out the far side, an iris
 *   that closed rim-in reopens centre-out, a clock hand completes a second lap).
 * - a {@link MaskPattern} — the colour uncovers through an unrelated geometry
 *   of its own (cover with a clock, uncover with a wipe, ...).
 */
export type ThroughColorUncover = "retreat" | "continue" | MaskPattern;

export type ThroughColorOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Hold colour. @default "#000000" */
    color?: string;
    /** Fraction (0–1) of the duration spent fully covered by the colour. @default 0.3 */
    hold?: number;
    /**
     * The coverage geometry the colour covers the frame through. See
     * {@link Mask}. Omit for a plain fade through the colour.
     */
    pattern?: MaskPattern;
    /**
     * Cover through the pattern's inverted orientation instead — e.g.
     * `Mask.iris()` covers centre-out by default, and rim-in (the classic
     * "iris to black") with `inverted: true`. @default false
     */
    inverted?: boolean;
    /** How the colour uncovers after the hold. Ignored without a `pattern`. @default "retreat" */
    uncover?: ThroughColorUncover;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * The "through colour" engine. A colour overlay covers the frame using the
 * chosen pattern, holds a solid-colour frame, then uncovers to reveal the
 * target image — so the target never appears until *after* the colour hold. The
 * previous/target images simply swap opacity at the midpoint, unseen behind the
 * fully-covered frame.
 *
 * The geometry lives entirely in the `pattern` option (see {@link Mask});
 * without one, the colour simply fades in and out (fade-to-black/white, or a
 * flash with `hold: 0`). {@link Reveal} is the direct-cut counterpart that
 * takes the same patterns. The `uncover` option picks how the second half
 * plays: see {@link ThroughColorUncover}.
 */
export class ThroughColor extends ImageTransition<AnimationType> {
    private duration: number;
    private color: string;
    private hold: number;
    private pattern: MaskPattern | null;
    private inverted: boolean;
    private uncover: ThroughColorUncover;
    private easing?: TransformDefinitions.EasingDefinition;

    constructor(options: ThroughColorOptions) {
        super();
        this.duration = options.duration;
        this.color = options.color ?? "#000000";
        this.hold = options.hold ?? 0.3;
        this.pattern = options.pattern ?? null;
        this.inverted = options.inverted ?? false;
        this.uncover = options.uncover ?? "retreat";
        this.easing = options.easing;
    }

    /** Style for the colour overlay at a given coverage (0 = clear, 1 = fully covered). */
    private coverStyle(cover: number, uncovering: boolean): CSSProps {
        if (!this.pattern) {
            return {...overlayBase(this.color), opacity: clamp01(cover)};
        }
        const base: CSSProps = {...overlayBase(this.color), opacity: 1};
        if (uncovering && this.uncover !== "retreat") {
            if (this.uncover === "continue") {
                // The complementary orientation at the same coverage keeps the
                // edge travelling forward instead of backing it out.
                return {...base, ...Mask.toStyle(this.pattern, cover, !this.inverted)};
            }
            return {...base, ...Mask.toStyle(this.uncover, cover)};
        }
        return {...base, ...Mask.toStyle(this.pattern, cover, this.inverted)};
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        const hold = clamp01(this.hold);
        const closeEnd = (1 - hold) / 2; // fully covered by here
        const openStart = 1 - closeEnd; // starts uncovering here
        const mid = 0.5; // fully covered window → swap the images here, unseen

        // Coverage (0–1) of the colour overlay: cover → hold → uncover.
        const coverAt = (progress: number): number => {
            if (progress <= closeEnd) return closeEnd <= 0 ? 1 : progress / closeEnd;
            if (progress >= openStart) return openStart >= 1 ? 1 : (1 - progress) / (1 - openStart);
            return 1;
        };

        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                // Previous image: visible until the frame is fully covered, then gone.
                this.asPrev<AnimationType>((progress: number) => ({
                    style: {opacity: progress < mid ? 1 : 0},
                })),
                // Target image: swapped in behind the colour, revealed as it uncovers.
                this.asTarget<AnimationType>((progress: number) => ({
                    style: {opacity: progress < mid ? 0 : 1},
                })),
                // Colour overlay on top: cover → hold → uncover.
                (progress: number) => ({
                    src: Image.DefaultImagePlaceholder,
                    style: this.coverStyle(coverAt(progress), progress >= openStart),
                }),
            ],
        };
    }

    copy(): ThroughColor {
        return new ThroughColor({
            duration: this.duration,
            color: this.color,
            hold: this.hold,
            pattern: this.pattern ?? undefined,
            inverted: this.inverted,
            uncover: this.uncover,
            easing: this.easing,
        });
    }
}
