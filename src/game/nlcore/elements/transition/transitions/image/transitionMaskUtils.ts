import {CSSProps} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {
    anticipate,
    backIn,
    backInOut,
    backOut,
    circIn,
    circInOut,
    circOut,
    cubicBezier,
    easeIn,
    easeInOut,
    easeOut,
} from "motion/react";

/**
 * Shared, side-effect-free helpers for the mask-driven transition machinery
 * ({@link Mask}, {@link ThroughColor}). Kept internal — not exported from the
 * package barrel.
 */

/** Orientation of the {@link Mask.blinds} slats. */
export type BlindsOrientation = "horizontal" | "vertical";

/** Clamp a value into the `[0, 1]` range. */
export function clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The `mask-image` triplet, mirrored to the `-webkit-` prefix for WebKit. */
export function maskStyle(image: string, size = "100% 100%", repeat = "no-repeat"): CSSProps {
    return {
        maskImage: image,
        WebkitMaskImage: image,
        maskSize: size,
        WebkitMaskSize: size,
        maskRepeat: repeat,
        WebkitMaskRepeat: repeat,
    };
}

/** Full-bleed positioning for a synthetic colour overlay layer. */
export function overlayBase(color: string): CSSProps {
    return {
        position: "absolute",
        top: "50%",
        left: "50%",
        width: "100%",
        height: "100%",
        transform: "translate(-50%, -50%)",
        backgroundColor: color,
    };
}

/** CSS gradient direction keyword for a wipe travelling toward `direction`. */
export function wipeGradientDir(direction: TransformDefinitions.WipeDirection): string {
    switch (direction) {
    case "left":
        return "to left";
    case "top":
        return "to top";
    case "bottom":
        return "to bottom";
    case "right":
    default:
        return "to right";
    }
}

/** Gradient axis for blinds slats of a given orientation. */
export function blindsAxis(orientation: BlindsOrientation): string {
    // Horizontal slats stack vertically → the gradient runs top-to-bottom.
    return orientation === "vertical" ? "to right" : "to bottom";
}

const NAMED_EASINGS: Record<string, (t: number) => number> = {
    easeIn,
    easeOut,
    easeInOut,
    circIn,
    circOut,
    circInOut,
    backIn,
    backOut,
    backInOut,
    anticipate,
};

/**
 * The curve an {@link TransformDefinitions.EasingDefinition} names, as a plain function.
 *
 * A transition that carves a *held* segment out of its run cannot let the animation driver ease the
 * whole 0-1 progress: the hold would then be a band of eased progress rather than of wall-clock
 * time, and an eased curve crosses the middle - exactly where the hold sits - at its fastest. Such
 * a transition asks the driver for a linear channel and eases each moving half itself, which is
 * what this resolves the curve for.
 *
 * The fallback is `easeInOut` and not `linear`, because that is what the driver applies when no
 * ease is given (motion's keyframes generator defaults to it): a transition easing its own halves
 * has to land on the same feel as one that does not.
 */
export function resolveEasing(ease?: TransformDefinitions.EasingDefinition): (t: number) => number {
    if (typeof ease === "function") {
        return ease;
    }
    if (Array.isArray(ease)) {
        return cubicBezier(ease[0], ease[1], ease[2], ease[3]);
    }
    if (ease === "linear") {
        return (t) => t;
    }
    return NAMED_EASINGS[ease ?? "easeInOut"] ?? easeInOut;
}

/**
 * How far a cover -> hold -> uncover run has travelled at a given point of a LINEAR run: `0` is
 * untouched, `1` is at the extreme (fully covered by the colour, fully blown out). Shared by
 * {@link ThroughColor} and {@link Exposure}, which differ only in what they do with the number.
 *
 * The hold is wall-clock time, carved out of `duration` and split evenly off the two moving halves,
 * so `holdMs: 2000` on a 4s run is two seconds at the extreme with a second either side. That is
 * only true because the run itself is linear and the easing is applied to each half here. Eased as
 * a whole - which is what asking the driver for an eased channel does - the hold is a band of
 * *progress* instead, and the curve crosses it at its fastest: under the default `easeInOut` a
 * nominal 30% hold plays as 17.8% of the wall clock, and 50% as 30.8%.
 *
 * `hold`, the fraction of the duration, is the older spelling and is read only when `holdMs` is
 * absent.
 */
export function heldRunCurve(options: {
    duration: number;
    hold?: number;
    holdMs?: number;
    easing?: TransformDefinitions.EasingDefinition;
}): (progress: number) => number {
    const ease = resolveEasing(options.easing);
    const closeEnd = (1 - holdFraction(options)) / 2;
    const openStart = 1 - closeEnd;

    return (progress: number) => {
        if (progress <= closeEnd) {
            return closeEnd <= 0 ? 1 : ease(clamp01(progress / closeEnd));
        }
        if (progress >= openStart) {
            return openStart >= 1 ? 1 : ease(clamp01((1 - progress) / (1 - openStart)));
        }
        return 1;
    };
}

/**
 * The share of a run spent held at the extreme: `holdMs` measured against the duration, or the
 * legacy `hold` fraction when no absolute time is given.
 *
 * A zero-length run has no share to measure, so any positive hold takes all of it - the transition
 * is then a cut to the extreme and back, which is what a zero duration asks for.
 */
export function holdFraction(options: { duration: number; hold?: number; holdMs?: number }): number {
    if (options.holdMs !== undefined) {
        if (options.duration <= 0) {
            return options.holdMs > 0 ? 1 : 0;
        }
        return clamp01(options.holdMs / options.duration);
    }
    return clamp01(options.hold ?? 0);
}
