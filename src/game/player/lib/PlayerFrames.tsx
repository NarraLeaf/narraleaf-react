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
    const game = useGame();

    return (
        <Isolated className={clsx(
            "absolute pointer-events-none w-full h-full",
        )} style={{
            transform: `scale(${ratio.state.scale})`,
            transformOrigin: "left top",
            width: game.config.width,
            height: game.config.height,
            pointerEvents: "none",
        }}>
            <div className={"absolute inset-0 pointer-events-auto"}>
                <div className={"inset-0"}>
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
