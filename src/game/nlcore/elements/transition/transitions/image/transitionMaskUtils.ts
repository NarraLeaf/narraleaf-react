import {CSSProps} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";

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
