import React, {useEffect} from "react";
import {Camera as GameCamera} from "@core/elements/camera";
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
    const {
        transformRef,
        transitionRefs,
        initDisplayable,
        applyTransition,
        applyTransform,
        updateStyleSync,
        deps,
    } = useDisplayable<any, HTMLDivElement>({
        element: camera,
        state: camera.transformState,
        skipTransform: state.game.config.allowSkipLayersTransform,
        skipTransition: false,
        transitionsProps: [{
            style: {
                width: "100%",
                height: "100%",
                transformOrigin: "center",
            }
        }],
    });

    useExposeState<ExposedStateType.camera>(camera, {
        initDisplayable,
        applyTransition,
        applyTransform,
        updateStyleSync,
    }, [...deps]);

    useEffect(() => {
        state.logger.debug("Camera", "Camera mounted", camera.getId());

        return () => {
            state.logger.debug("Camera", "Camera unmounted", camera.getId());
        };
    }, []);

    return (
        <motion.div className={"absolute w-full h-full"} ref={transformRef} data-element-type={"camera"}>
            {transitionRefs.map(([ref, key]) => (
                <div className={"relative w-full h-full"} ref={ref} key={key}>
                    {children}
                </div>
            ))}
        </motion.div>
    );
}
