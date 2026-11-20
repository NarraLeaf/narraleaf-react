import React from "react";
import type {CSSProps} from "@core/elements/transition/type";

/**
 * How a layer with parallax reaches the camera it sits in.
 *
 * The camera drives each such layer's wrapper as a companion of its own transform - in the same
 * animation, from the same keyframes - so a pan carries every layer along at its own share with no
 * frame between them. A layer registers its wrapper while it is mounted and paints the camera's
 * current pose once on the way in, which is what puts a layer that arrives with a new scene where it
 * belongs when the camera was already turned elsewhere.
 * @internal
 */
export type CameraParallaxBinding = {
    /** Drive this wrapper from the camera until the returned function is called. */
    register(ref: React.RefObject<HTMLElement | null>, parallax: number): () => void;
    /** The wrapper's style for the camera's pose right now. */
    project(parallax: number): CSSProps;
};

/** @internal */
export const CameraParallaxContext = React.createContext<CameraParallaxBinding | null>(null);
