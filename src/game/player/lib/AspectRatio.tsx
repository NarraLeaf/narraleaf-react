import clsx from "clsx";
import React, {useEffect, useReducer, useState} from "react";
import {useRatio} from "@player/provider/ratio";
import {useGame} from "@player/provider/game-state";

export default function AspectRatio(
    {
        children,
        className
    }: {
        children: React.ReactNode,
        className?: string;
    }) {
    const [style, setStyle] = useState({});
    const {ratio} = useRatio();
    const {game} = useGame();
    const [, forceUpdate] = useReducer((x) => x + 1, 0);


    const MIN_WIDTH = 1600 * 0.5;
    const MIN_HEIGHT = 900 * 0.5;

    useEffect(() => {
        let resizeTimeout: NodeJS.Timeout;
        const updateStyle = () => {
            if (ratio.isLocked()) {
                console.warn("Ratio is locked, skipping update");
                return;
            }

            const container = document.getElementById(game.config.player.contentContainerId);
            if (container) {
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                const aspectRatio = 16 / 9;

                let width: number, height: number;
                if (containerWidth / containerHeight > aspectRatio) {
                    width = containerHeight * aspectRatio;
                    height = containerHeight;
                } else {
                    width = containerWidth;
                    height = containerWidth / aspectRatio;
                }

                if (width < MIN_WIDTH) width = MIN_WIDTH;
                if (height < MIN_HEIGHT) height = MIN_HEIGHT;

                setStyle({
                    width: `${width}px`,
                    height: `${height}px`,
                    margin: "auto",
                    position: "absolute",
                    top: "0",
                    bottom: "0",
                    left: "0",
                    right: "0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                });

                ratio.update(width, height);
                ratio.updateMin(MIN_WIDTH, MIN_HEIGHT);
                forceUpdate();
            }
        };

        ratio.setUpdate(updateStyle);

        const handleResize = () => {
            updateStyle();
            clearTimeout(resizeTimeout);

            ratio.pause();
            resizeTimeout = setTimeout(() => {
                ratio.resume();
            }, 100);
        };

        updateStyle();
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            clearTimeout(resizeTimeout);
        };
    }, [ratio]);

    return (
        <div id={game.config.player.contentContainerId}
             style={{position: "relative", width: "100%", height: "100%", overflow: "hidden"}}>
            <div className={clsx(className)} style={style}>
                {children}
            </div>
        </div>
    );
};