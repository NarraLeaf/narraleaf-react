import React from "react";
import {useRatio} from "@player/provider/ratio";
import Isolated from "@player/lib/isolated";
import clsx from "clsx";
import {useGame} from "@player/provider/game-state";

type ForwardChildren = {
    children?: React.ReactNode;
};

type ForwardStyle = {
    className?: string;
    style?: React.CSSProperties;
};

function Full({children, className, style}: ForwardChildren & ForwardStyle) {
    const {ratio} = useRatio();
    const {game} = useGame();

    return (
        <Isolated className={clsx(
            "absolute pointer-events-none w-full h-full",
        )} style={{
            transform: `scale(${ratio.state.scale})`,
            transformOrigin: "left top",
            width: game.config.player.width,
            height: game.config.player.height,
            pointerEvents: "none",
        }}>
            <div className={"absolute w-full h-full"}>
                <div className={"h-full w-full"} style={{
                    pointerEvents: "all",
                }}>
                    <div className={clsx(className)} style={style}>
                        {children}
                    </div>
                </div>
            </div>
        </Isolated>
    );
}

export {
    Full,
};
