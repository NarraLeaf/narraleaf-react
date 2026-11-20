/**
 * What `LiveGame.captureImage` is asked for, and the one sum it does before handing the stage to
 * html-to-image.
 *
 * `capturePng` draws the stage at the size it is shown in the window times the display's pixel
 * ratio - 2800 x 1576 for a 1400-wide stage on a 2x display - and encodes that as a PNG. A caller
 * that only wants a thumbnail then decodes it again, draws it small and encodes it once more, and
 * the full-size drawing and both encodings are most of what the picture costs. Drawn straight at
 * the size it is wanted, the same picture has a sixteenth of the pixels to rasterise and encode.
 */

export type CaptureImageOptions = {
    /**
     * The longest edge of the picture, in pixels. The stage is drawn straight at this size rather
     * than drawn full size and scaled afterwards. A picture is never drawn larger than `capturePng`
     * would draw it; omitted, it is exactly that size.
     */
    maxEdge?: number;
    /**
     * The encoding: `"image/png"` (the default), `"image/jpeg"` or `"image/webp"`. A type the
     * browser cannot encode answers with a PNG, as `HTMLCanvasElement.toDataURL` does - check the
     * data URL's prefix when it matters.
     */
    type?: string;
    /** Encoder quality on the 0-1 scale, for JPEG and WebP. Defaults to `screenshotQuality`. */
    quality?: number;
    /**
     * Painted under the stage before it is drawn. JPEG has no transparency, so a JPEG without one
     * shows whatever the stage leaves transparent as black.
     */
    backgroundColor?: string;
};

/**
 * The pixel ratio that draws a stage of `size` CSS pixels with its longest edge at `maxEdge`,
 * never above `deviceRatio` - the ratio `capturePng` draws at.
 */
export function captureImagePixelRatio(
    size: { width: number; height: number },
    maxEdge: number | undefined,
    deviceRatio: number,
): number {
    const longest = Math.max(size.width, size.height);
    if (maxEdge === undefined || !(maxEdge > 0) || !(longest > 0)) {
        return deviceRatio;
    }
    return Math.min(deviceRatio, maxEdge / longest);
}
