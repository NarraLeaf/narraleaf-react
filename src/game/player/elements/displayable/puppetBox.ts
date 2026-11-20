import type {CSSProperties} from "react";
import type {PuppetSize} from "@core/game/puppet/puppetBackend";

/**
 * The two boxes a puppet occupies on a stage drawn at `scale`.
 *
 * A puppet's size is in the game's logical pixels, the same units as `GameConfig.width` / `height`,
 * and the stage is drawn at `scale` of them (the width the player sees over `GameConfig.width`).
 * Every other displayable takes that scale into account: an image is sized at its natural size
 * times the scale, a text is scaled by it. So the puppet's box is too:
 *
 * - `outer` is the box the stage lays out: the logical size times the scale. It is what the
 *   transform centres on its position, what a layer and the camera move, and what the player sees.
 * - `host` is the element the backend draws into. It keeps the logical size and is scaled onto
 *   `outer` with a CSS transform, so a backend that sizes its canvas from `ctx.size` and one that
 *   fills its container both fit the box, and neither has to hear about the stage being resized.
 *
 * A scale that is not a positive number (the stage has not been measured yet) draws nothing, as an
 * image does before its stage is known.
 */
export function puppetBoxStyles(size: PuppetSize, scale: number): { outer: CSSProperties; host: CSSProperties } {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 0;
    return {
        outer: {
            width: `${size.width * s}px`,
            height: `${size.height * s}px`,
        },
        host: {
            position: "absolute",
            left: 0,
            top: 0,
            width: `${size.width}px`,
            height: `${size.height}px`,
            transform: `scale(${s})`,
            transformOrigin: "0 0",
        },
    };
}
