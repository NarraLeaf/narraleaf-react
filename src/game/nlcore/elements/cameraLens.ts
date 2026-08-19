import type {CSSProps} from "@core/elements/transition/type";
import type {TransformDefinitions} from "@core/elements/transform/type";

/**
 * The neutral pose of the lens: no shutter, no vignette, and the geometry the effect uses when
 * it is turned up.
 *
 * These are the values the old `blink` / `vignette` screen-effect routines were written with, kept
 * to the digit so that turning a channel up produces the picture those routines produced.
 *
 * @internal
 */
export const CameraLensDefaults = {
    shutter: 0,
    shutterColor: "#000",
    vignette: 0,
    vignetteColor: "#000",
    vignetteInner: "44%",
    vignetteOuter: "78%",
} as const satisfies Required<TransformDefinitions.CameraLensProps>;

/**
 * Read a lens channel as a number in `[0, 1]`.
 *
 * Everything that is not a finite number — most importantly `undefined`, which is what a save
 * written before these channels existed deserialises to — reads as `0`. That is not defensive
 * tidiness: these numbers are interpolated straight into a CSS `inset()`, and a single `NaN%` makes
 * the browser discard the whole declaration, so the overlay would silently stop clipping and paint
 * a black rectangle over the stage instead of nothing at all.
 *
 * @internal
 */
export function lensAmount(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}

/**
 * Read a lens geometry/colour field, falling back to the neutral value for anything unset.
 * @internal
 */
function lensText(value: unknown, fallback: string): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * The upper shutter blade.
 *
 * `shutter` is coverage, not position: at `1` each blade covers half the frame and the two meet in
 * the middle, which is the geometry the old `blink` routine animated by hand. So the blade's bottom
 * inset runs from `100%` (nothing drawn) at `0` to `50%` at `1`.
 *
 * @internal
 */
export function shutterTopStyle(props: Partial<TransformDefinitions.CameraLensProps>): CSSProps {
    const amount = lensAmount(props.shutter);
    return {
        backgroundColor: lensText(props.shutterColor, CameraLensDefaults.shutterColor),
        clipPath: `inset(0 0 ${100 - 50 * amount}% 0)`,
    };
}

/**
 * The lower shutter blade — the mirror of {@link shutterTopStyle}.
 * @internal
 */
export function shutterBottomStyle(props: Partial<TransformDefinitions.CameraLensProps>): CSSProps {
    const amount = lensAmount(props.shutter);
    return {
        backgroundColor: lensText(props.shutterColor, CameraLensDefaults.shutterColor),
        clipPath: `inset(${100 - 50 * amount}% 0 0 0)`,
    };
}

/**
 * The vignette plate: a flat colour masked by a radial gradient, faded in by `vignette`.
 *
 * The mask is rebuilt from `vignetteInner` / `vignetteOuter` on every frame rather than being
 * written once, so a story that moves the falloff mid-shot gets a mask that follows it.
 *
 * @internal
 */
export function vignetteStyle(props: Partial<TransformDefinitions.CameraLensProps>): CSSProps {
    const inner = lensText(props.vignetteInner, CameraLensDefaults.vignetteInner);
    const outer = lensText(props.vignetteOuter, CameraLensDefaults.vignetteOuter);
    const maskImage = `radial-gradient(circle at center, transparent ${inner}, black ${outer})`;
    return {
        backgroundColor: lensText(props.vignetteColor, CameraLensDefaults.vignetteColor),
        opacity: lensAmount(props.vignette),
        maskImage,
        WebkitMaskImage: maskImage,
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskMode: "alpha",
        WebkitMaskMode: "alpha",
    } as CSSProps;
}
