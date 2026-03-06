import React from "react";
import { useNvl } from "./NvlContext";
import { NvlContainerProps, INvlContainerProps } from "./type";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { useRatio } from "@player/provider/ratio";
import { useGame } from "@lib/game/player/provider/game-state";

export function NvlContainer({ children, className, style }: NvlContainerProps) {
    const { isVisible, transitionOptions } = useNvl();
    const { ratio } = useRatio();
    const game = useGame();

    const duration = transitionOptions?.duration ? transitionOptions.duration / 1000 : 0.3;

    return (
        <AnimatePresence>
            {isVisible && (
                <div
                    className="absolute inset-0 p-6"
                    data-element-type="nvl-container-wrapper"
                >
                    <motion.div
                        key="nvl-container"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration }}
                        data-element-type="nvl-container"
                        className={clsx(
                            "w-full h-full overflow-auto",
                            className
                        )}
                        style={{
                            transform: game.config.useAspectScale ? `scale(${ratio.state.scale})` : undefined,
                            transformOrigin: "top left",
                            width: game.config.useAspectScale ? game.config.width : "100%",
                            height: game.config.useAspectScale ? game.config.height : "100%",
                            ...style,
                        }}
                    >
                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export function BaseNvlContainer({ renderDialogItem: _renderDialogItem, ...props }: INvlContainerProps & NvlContainerProps) {
    return <NvlContainer {...props} />;
}

export default NvlContainer;
