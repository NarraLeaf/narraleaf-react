import React, {useEffect} from "react";
import {Layer as GameLayer} from "@core/elements/layer";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {GameState} from "@player/gameState";
import {motion} from "motion/react";
import {useExposeState} from "@player/lib/useExposeState";

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

    useEffect(() => {
        state.logger.debug("Layer", "Layer mounted", layer.getId());

        return () => {
            state.logger.debug("Layer", "Layer unmounted", layer.getId());
        };
    }, []);

    return (
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
}