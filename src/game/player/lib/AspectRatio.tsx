import clsx from "clsx";
import React, {useEffect, useState} from "react";
import {useRatio} from "@player/provider/ratio";
import {useGame} from "@player/provider/game-state";
import {debounce} from "@lib/util/data";
import {GameState} from "@player/gameState";
import {useFlush} from "@player/lib/flush";

export default function AspectRatio(
    {
        children,
        className,
        gameState,
    }: {
        children: React.ReactNode,
        className?: string;
        gameState: GameState;
    }) {
    const [style, setStyle] = useState({});
    const {ratio} = useRatio();
    const {game} = useGame();
    const [flush] = useFlush();

    const MIN_WIDTH = game.config.player.minWidth;
    const MIN_HEIGHT = game.config.player.minHeight;

    useEffect(() => {
        gameState.logger.debug("AspectRatio", "mount, using interval", game.config.player.ratioUpdateInterval);
        const updateStyle = () => {
            if (ratio.isLocked()) {
                gameState.logger.weakWarn("Ratio is locked, skipping update");
                return;
            }

            const container = document.getElementById(game.config.player.contentContainerId);
            if (container) {
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                const aspectRatio = game.config.player.aspectRatio;

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

                const scale = width / game.config.player.width;
                ratio.update(width, height, scale);
                ratio.updateMin(MIN_WIDTH, MIN_HEIGHT);
                flush();
            }
        };

        ratio.setUpdate(updateStyle);

        const handleResize = () => {
            updateStyle();
        };

        const listener = debounce(handleResize, game.config.player.ratioUpdateInterval);

        listener();
        window.addEventListener("resize", listener);

        const updateRequestListenerToken = ratio.onRequestedUpdate(listener);

        return () => {
            window.removeEventListener("resize", listener);
            updateRequestListenerToken();
        };
    }, [ratio, game.config.player.ratioUpdateInterval]);

    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.requestFlush"], flush).cancel;
    }, [gameState]);

    return (
        <div id={game.config.player.contentContainerId}
             style={{position: "relative", width: "100%", height: "100%", overflow: "hidden"}}>
            <div className={clsx(className)} style={style}>
                {children}
            </div>
        </div>
    );
};