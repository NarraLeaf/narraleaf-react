import type {CSSProps} from "@core/elements/transition/type";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {Transform} from "@core/elements/transform/transform";

/**
 * What a layer's parallax has to know about the stage it is drawn on: the design size, which the
 * camera's offsets are measured in, and which corner positions are measured from.
 * @internal
 */
export type ParallaxFrame = {
    width: number;
    height: number;
    invertX: boolean;
    invertY: boolean;
};

/**
 * The smallest a layer is ever drawn by parallax, as a share of its own size.
 *
 * A near layer shrinks faster than the camera when the camera pulls back, and far enough back that
 * runs through zero and out the other side - a layer drawn inside out. The camera itself is floored
 * by the editor that writes its zoom; this is the same floor, for the share parallax works out.
 * @internal
 */
export const MIN_PARALLAX_SCALE = 0.05;

function finite(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** `"30%"` as `30`; anything that is not a plain percentage reads as the centre. */
function percentOf(value: unknown): number {
    if (typeof value !== "string") {
        return 50;
    }
    const match = /^(-?\d+(?:\.\d+)?)%$/.exec(value.trim());
    return match ? parseFloat(match[1]) : 50;
}

function round(value: number): number {
    return Math.round(value * 1e4) / 1e4;
}

/**
 * How far the camera's position has moved the stage, in design pixels along the screen's axes
 * (x to the right, y downwards), whatever corner the story measures from.
 *
 * Read through {@link Transform.positionToCSS} - the same conversion that places the camera - rather
 * than worked out again from the position's fields, so an align, an offset, a named position and a
 * percentage all mean here exactly what they mean to the wrapper they move.
 * @internal
 */
export function cameraStageShift(
    props: Partial<TransformDefinitions.Types>,
    frame: ParallaxFrame,
): { x: number; y: number } {
    const position = (props as Partial<TransformDefinitions.ImageTransformProps>).position;
    if (!position) {
        return {x: 0, y: 0};
    }
    const css = Transform.positionToCSS(position as never, frame.invertY, frame.invertX, {
        width: frame.width,
        height: frame.height,
    }) as Record<string, unknown>;
    const xShare = (percentOf(frame.invertX ? css.right : css.left) - 50) / 100;
    const yShare = (percentOf(frame.invertY ? css.bottom : css.top) - 50) / 100;
    // Measured from the far edge, a larger value moves the wrapper the other way on screen.
    return {
        x: (frame.invertX ? -xShare : xShare) * frame.width,
        y: (frame.invertY ? -yShare : yShare) * frame.height,
    };
}

/**
 * The style of a layer's parallax wrapper for one camera pose.
 *
 * The wrapper sits inside the camera, so the camera has already moved, scaled and turned it as it
 * moves every layer. What is left to do is the difference between that and what a layer at this
 * distance should do:
 *
 * - **Pan.** The layer should move `parallax` times as far as the camera moves the stage. The camera
 *   moves it the whole way, so the wrapper moves it back by the rest - and since that correction is
 *   drawn inside the camera, it is first undone through the camera's own rotation and scale, which
 *   would otherwise turn and stretch it.
 * - **Zoom.** The layer should grow by `parallax` times as much as the camera grows the stage
 *   (`1 + parallax * (zoom - 1)`), and the wrapper supplies whatever share of that the camera's own
 *   zoom does not.
 * - **Rotation and stretch** are left to the camera: a turn of the camera turns every layer alike.
 *
 * The transform names the same two functions in the same order for every pose, which is what lets
 * the animation interpolate between two poses instead of snapping.
 * @internal
 */
export function parallaxStyle(
    props: Partial<TransformDefinitions.Types>,
    parallax: number,
    frame: ParallaxFrame,
): CSSProps {
    const shared = props as Partial<TransformDefinitions.ImageTransformProps>;
    const zoom = finite(shared.zoom, 1);
    const scaleX = finite(shared.scaleX, 1) * zoom;
    const scaleY = finite(shared.scaleY, 1) * zoom;
    const angle = finite(shared.rotation, 0) * Math.PI / 180;

    const shift = cameraStageShift(props, frame);
    const wantX = (parallax - 1) * shift.x;
    const wantY = (parallax - 1) * shift.y;
    // Undo the camera's rotation (CSS turns clockwise on a y-down screen), then its scale.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const turnedX = cos * wantX + sin * wantY;
    const turnedY = -sin * wantX + cos * wantY;
    const x = scaleX !== 0 ? turnedX / scaleX : 0;
    const y = scaleY !== 0 ? turnedY / scaleY : 0;

    const layerZoom = Math.max(MIN_PARALLAX_SCALE, 1 + parallax * (zoom - 1));
    const scale = zoom !== 0 ? layerZoom / zoom : 1;

    const xPercent = frame.width > 0 ? round(x / frame.width * 100) : 0;
    const yPercent = frame.height > 0 ? round(y / frame.height * 100) : 0;
    return {
        transform: `translate(${xPercent}%, ${yPercent}%) scale(${round(scale)})`,
    } as CSSProps;
}
