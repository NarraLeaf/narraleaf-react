import React, {useContext, useEffect, useLayoutEffect, useRef} from "react";
import {Layer as GameLayer} from "@core/elements/layer";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {GameState} from "@player/gameState";
import {motion} from "motion/react";
import {useExposeState} from "@player/lib/useExposeState";
import {CameraParallaxContext} from "@player/elements/player/cameraParallaxContext";

export function Layer(
    {state, layer, children}: Readonly<{
        state: GameState;
        layer: GameLayer;
        children: React.ReactNode;
    }>
) {
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
        element: layer,
        state: layer.transformState,
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

    useExposeState(layer, {
        initDisplayable,
        applyTransition,
        applyTransform,
        applyLoop,
        stopLoop,
        updateStyleSync,
    }, [...deps]);

    // A layer that follows the camera exactly (the default, and every layer before parallax existed)
    // renders no wrapper at all, so its markup and its animations are what they always were.
    const parallax = layer.getParallax();
    const camera = useContext(CameraParallaxContext);
    const parallaxRef = useRef<HTMLDivElement | null>(null);
    const atDistance = parallax !== 1 && camera !== null;
    useLayoutEffect(() => {
        if (!atDistance || !parallaxRef.current) {
            return;
        }
        // Painted once on the way in: the camera may already be panned when this layer's scene
        // arrives, and the next camera move could be a long way off.
        Object.assign(parallaxRef.current.style, camera!.project(parallax));
        return camera!.register(parallaxRef, parallax);
    }, [atDistance, camera, parallax]);

    useEffect(() => {
        state.logger.debug("Layer", "Layer mounted", layer.getId());

        return () => {
            state.logger.debug("Layer", "Layer unmounted", layer.getId());
        };
    }, []);

    const content = (
        <>
            {/* No `layout` here: layers are always w-full/h-full of the stage, so FLIP projection
                only fires on stage resizes — animating those is wrong (letterboxing must snap),
                and an interrupted projection leaves a corrupt `transform` behind. */}
            <motion.div className={"absolute w-full h-full"} ref={transformRef} data-element-type={"layer"} data-layer-id={layer.getId()} key={`layer-${layer.getId()}`}>
                {transitionRefs.map(([ref, key]) => (
                    <div className={"relative w-full h-full"} ref={ref} key={key}>
                        {children}
                    </div>
                ))}
            </motion.div>
        </>
    );

    if (!atDistance) {
        return content;
    }
    // Outside the layer's own wrapper, so the layer's own transform still applies in its own frame -
    // inside the share of the camera's movement that its distance gives it.
    return (
        <div
            className={"absolute w-full h-full"}
            ref={parallaxRef}
            data-element-type={"layer-parallax"}
            style={{transformOrigin: "center"}}
        >
            {content}
        </div>
    );
}