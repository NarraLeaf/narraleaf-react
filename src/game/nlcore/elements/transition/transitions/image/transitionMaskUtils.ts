import {CSSProps} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";

/**
 * Shared, side-effect-free helpers for the mask/gradient driven image
 * transitions ({@link SoftWipe}, {@link Blinds}, {@link SoftIris},
 * {@link ThroughColor}). Kept internal — not exported from the package barrel.
 */

/** Orientation of {@link Blinds} slats / {@link ThroughColor} blinds pattern. */
export type BlindsOrientation = "horizontal" | "vertical";

/** Clamp a value into the `[0, 1]` range. */
export function clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The `mask-image` triplet, mirrored to the `-webkit-` prefix for WebKit. */
export function maskStyle(image: string): CSSProps {
    return {
        maskImage: image,
        WebkitMaskImage: image,
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
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

/**
 * Feathered linear wipe mask. `progress` 0 → fully hidden, 1 → fully covered;
 * the opaque edge sweeps with a soft transition band of width `feather` (%).
 */
export function linearWipeMask(
    direction: TransformDefinitions.WipeDirection,
    feather: number,
    progress: number,
): string {
    const f = Math.max(0, feather);
    // Sweep the opaque edge from just before the start to just past the end so
    // the reveal is total at the extremes.
    const edge = -f + clamp01(progress) * (100 + f);
    return `linear-gradient(${wipeGradientDir(direction)}, #000 ${edge}%, transparent ${edge + f}%)`;
}

/** Venetian slats mask. `progress` 0 → open (hidden), 1 → shut (covered). */
export function blindsCoverMask(
    orientation: BlindsOrientation,
    slats: number,
    progress: number,
): string {
    const pitch = 100 / Math.max(1, slats);
    const cover = clamp01(progress) * pitch;
    return `repeating-linear-gradient(${blindsAxis(orientation)}, #000 0, #000 ${cover}%, transparent ${cover}%, transparent ${pitch}%)`;
}

/** Iris that *covers* from the rim inward. `progress` 0 → hidden, 1 → covered. */
export function irisCoverMask(center: string, feather: number, progress: number): string {
    const f = Math.max(0, feather);
    const r = (1 - clamp01(progress)) * 150; // transparent hole shrinks to nothing
    return `radial-gradient(circle at ${center}, transparent ${r - f}%, #000 ${r}%)`;
}

/** Iris that *reveals* from the centre out. `progress` 0 → hidden, 1 → shown. */
export function irisRevealMask(center: string, feather: number, progress: number): string {
    const f = Math.max(0, feather);
    const r = clamp01(progress) * 150; // opaque disc grows to cover
    return `radial-gradient(circle at ${center}, #000 ${r - f}%, transparent ${r}%)`;
}
