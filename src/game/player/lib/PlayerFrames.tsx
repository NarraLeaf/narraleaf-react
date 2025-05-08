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
} & React.HTMLAttributes<HTMLDivElement>;

function Full({children, className, style, ...props}: ForwardChildren & ForwardStyle & React.HTMLAttributes<HTMLDivElement>) {
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
        }} data-element-type="full" {...props}>
            <div className={"absolute inset-0"}>
                <div className={"inset-0 pointer-events-auto"}>
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
