import {CSSProps, TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Image} from "@core/elements/displayable/image";
import {
    BlindsOrientation,
    blindsCoverMask,
    clamp01,
    irisCoverMask,
    linearWipeMask,
    maskStyle,
    overlayBase,
} from "@core/elements/transition/transitions/image/transitionMaskUtils";

type AnimationType = [TransitionAnimationType.Number];

/** `null` = plain (drive the overlay opacity); a function = a coverage mask. */
type CoverMask = ((cover: number) => string) | null;

type ThroughColorBaseOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /** Hold colour. @default "#000000" */
    color?: string;
    /** Fraction (0–1) of the duration spent fully covered by the colour. @default 0.3 */
    hold?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

export type ThroughColorFadeOptions = ThroughColorBaseOptions;

export type ThroughColorWipeOptions = ThroughColorBaseOptions & {
    /** Direction the feathered edge travels toward. @default "left" */
    direction?: TransformDefinitions.WipeDirection;
    /** Width of the soft edge band, in percent. @default 12 */
    feather?: number;
};

export type ThroughColorBlindsOptions = ThroughColorBaseOptions & {
    /** Slat orientation. @default "horizontal" */
    orientation?: BlindsOrientation;
    /** Number of slats. @default 8 */
    slats?: number;
};

export type ThroughColorIrisOptions = ThroughColorBaseOptions & {
    /** Centre of the iris, as a CSS position. @default "50% 50%" */
    center?: string;
    /** Width of the soft edge band, in percent. @default 12 */
    feather?: number;
};

/**
 * The "through colour" engine. A colour overlay covers the frame using the
 * chosen pattern, holds a solid-colour frame, then uncovers to reveal the
 * target image — so the target never appears until *after* the colour hold. The
 * previous/target images simply swap opacity at the midpoint, unseen behind the
 * fully-covered frame.
 *
 * Created through its static factories (mirroring {@link MaskTransition}):
 * - {@link ThroughColor.fade}   — the overlay fades in/out (fade-to-black/white; `hold: 0` = flash).
 * - {@link ThroughColor.wipe}   — a feathered directional edge (soft wipe through the colour).
 * - {@link ThroughColor.blinds} — venetian slats (blinds through the colour).
 * - {@link ThroughColor.iris}   — a circle closing from the rim in (iris to the colour).
 */
export class ThroughColor extends ImageTransition<AnimationType> {
    private constructor(
        private duration: number,
        private color: string,
        private hold: number,
        private coverMask: CoverMask,
        private easing?: TransformDefinitions.EasingDefinition,
    ) {
        super();
    }

    /** Fade the frame to a solid colour, hold, then fade to the target. */
    static fade(options: ThroughColorFadeOptions): ThroughColor {
        return new ThroughColor(
            options.duration,
            options.color ?? "#000000",
            options.hold ?? 0.3,
            null,
            options.easing,
        );
    }

    /** Cover the frame with a feathered directional edge, hold, then uncover. */
    static wipe(options: ThroughColorWipeOptions): ThroughColor {
        const direction = options.direction ?? "left";
        const feather = options.feather ?? 12;
        return new ThroughColor(
            options.duration,
            options.color ?? "#000000",
            options.hold ?? 0.3,
            (cover) => linearWipeMask(direction, feather, cover),
            options.easing,
        );
    }

    /** Cover the frame with venetian slats, hold, then uncover. */
    static blinds(options: ThroughColorBlindsOptions): ThroughColor {
        const orientation = options.orientation ?? "horizontal";
        const slats = options.slats ?? 8;
        return new ThroughColor(
            options.duration,
            options.color ?? "#000000",
            options.hold ?? 0.3,
            (cover) => blindsCoverMask(orientation, slats, cover),
            options.easing,
        );
    }

    /** Close a circle over the frame from the rim in, hold, then open it. */
    static iris(options: ThroughColorIrisOptions): ThroughColor {
        const center = options.center ?? "50% 50%";
        const feather = options.feather ?? 12;
        return new ThroughColor(
            options.duration,
            options.color ?? "#000000",
            options.hold ?? 0.3,
            (cover) => irisCoverMask(center, feather, cover),
            options.easing,
        );
    }

    /** Style for the colour overlay at a given coverage (0 = clear, 1 = fully covered). */
    private coverStyle(cover: number): CSSProps {
        if (!this.coverMask) {
            return {...overlayBase(this.color), opacity: clamp01(cover)};
        }
        return {...overlayBase(this.color), opacity: 1, ...maskStyle(this.coverMask(cover))};
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
                    style: this.coverStyle(coverAt(progress)),
                }),
            ],
        };
    }

    copy(): ThroughColor {
        return new ThroughColor(this.duration, this.color, this.hold, this.coverMask, this.easing);
    }
}
