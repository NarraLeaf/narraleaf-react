import React, {useEffect, useRef} from "react";
import {Camera as GameCamera} from "@core/elements/camera";
import {shutterBottomStyle, shutterTopStyle, vignetteStyle} from "@core/elements/cameraLens";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {GameState} from "@player/gameState";
import {motion} from "motion/react";
import {useExposeState} from "@player/lib/useExposeState";
import {ExposedStateType} from "@player/type";

/**
 * The stage camera.
 *
 * A single transformed wrapper around the whole visual stage (every scene's layers/backgrounds
 * and the videos). It is the {@link Layer} pattern hoisted one level up: it binds the core
 * {@link GameCamera}'s `transformState` and exposes the same imperative transform handles, so
 * camera moves reuse the standard `DisplayableAction.applyTransform` pipeline. The dialog box,
 * menus and NVL layer are rendered outside it and stay fixed.
 * @internal
 */
export function Camera(
    {state, camera, children}: Readonly<{
        state: GameState;
        camera: GameCamera;
        children: React.ReactNode;
    }>
) {
    const vignetteRef = useRef<HTMLDivElement | null>(null);
    const shutterTopRef = useRef<HTMLDivElement | null>(null);
    const shutterBottomRef = useRef<HTMLDivElement | null>(null);

    const {
        transformRef,
        transitionRefs,
        initDisplayable,
        applyTransition,
        applyTransform,
        applyLoop,
        stopLoop,
        updateStyleSync,
        deps,
    } = useDisplayable<any, HTMLDivElement>({
        element: camera,
        state: camera.transformState,
        skipTransform: state.game.config.allowSkipLayersTransform,
        skipTransition: false,
        // The lens plates are driven by the camera's own transform state but live outside its
        // transformed wrapper, so they are companions rather than children — see the JSX below.
        companionRefs: [
            {ref: vignetteRef, project: vignetteStyle},
            {ref: shutterTopRef, project: shutterTopStyle},
            {ref: shutterBottomRef, project: shutterBottomStyle},
        ],
        transitionsProps: [{
            style: {
                width: "100%",
                height: "100%",
                transformOrigin: "center",
                // Clip the stage content to the stage rectangle *inside* the camera transform, so the
                // clip rotates/scales/pans together with the camera. Without this the only clip is the
                // stage viewport (mainContentRef), which never rotates — so a sprite that extends past
                // the background (e.g. feet below the frame, normally hidden by the viewport) swings
                // into view the moment the camera is rotated. The viewport still clips the transformed
                // camera to the screen on top of this.
                overflow: "hidden",
            }
        }],
    });

    useExposeState<ExposedStateType.camera>(camera, {
        initDisplayable,
        applyTransition,
        applyTransform,
        applyLoop,
        stopLoop,
        updateStyleSync,
    }, [...deps]);

    useEffect(() => {
        state.logger.debug("Camera", "Camera mounted", camera.getId());

        return () => {
            state.logger.debug("Camera", "Camera unmounted", camera.getId());
        };
    }, []);

    return (
        <>
            <motion.div className={"absolute w-full h-full"} ref={transformRef} data-element-type={"camera"}>
                {transitionRefs.map(([ref, key]) => (
                    <div className={"relative w-full h-full"} ref={ref} key={key}>
                        {children}
                    </div>
                ))}
            </motion.div>
            {/* The lens: a shutter and a vignette, pinned to the viewport.

                A sibling of the camera rather than a child of it, and that is the whole point. A
                vignette is something the lens does, not something in the scene, so it must not
                scale, pan or rotate with the camera — which is exactly what the old scene-level
                screen-effect layer did, because it sat inside the transform.

                Document order does the layering. The camera div always carries a transform, so it
                is a stacking context of its own and nothing inside it (scenes, the stage-transition
                overlay, videos, vfx — however high their z-index) can rise above a later sibling.
                The lens therefore covers all of them, and still sits below the dialogs and the NVL
                layer, which are rendered after it — the same relative order the scene-level effect
                layer had, minus the transform it should never have inherited. */}
            <div
                className={"absolute w-full h-full"}
                data-element-type={"camera-lens"}
                style={{pointerEvents: "none"}}
            >
                <div className={"absolute w-full h-full"} ref={vignetteRef} data-element-type={"camera-lens-vignette"} />
                <div className={"absolute w-full h-full"} ref={shutterTopRef} data-element-type={"camera-lens-shutter-top"} />
                <div className={"absolute w-full h-full"} ref={shutterBottomRef} data-element-type={"camera-lens-shutter-bottom"} />
            </div>
        </>
    );
}
