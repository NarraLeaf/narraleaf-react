import React from "react";
import {Layer as GameLayer} from "@core/elements/layer";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {GameState} from "@player/gameState";
import {motion} from "motion/react";

export function Layer(
    {state, layer, children}: Readonly<{
        state: GameState;
        layer: GameLayer;
        children: React.ReactNode;
    }>
) {
    const {transformRef, transitionRefs} = useDisplayable<any, HTMLDivElement>({
        element: layer,
        state: layer.transformState,
        skipTransform: state.game.config.elements.layers.allowSkipTransform,
        skipTransition: false,
        transformStyle: {
            width: "100%",
            height: "100%",
        },
        transitionsProps: [{
            style: {
                width: "100%",
                height: "100%",
                transformOrigin: "center",
            }
        }],
    });

    return (
        <>
            <motion.div layout className={"absolute w-full h-full"} ref={transformRef}>
                {transitionRefs.map(([ref, key]) => (
                    <div className={"relative w-full h-full"} ref={ref} key={key}>
                        {children}
                    </div>
                ))}
            </motion.div>
        </>
    );
}