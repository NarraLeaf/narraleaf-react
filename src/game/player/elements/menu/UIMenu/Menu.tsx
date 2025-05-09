import { useRatio } from "@lib/game/player/provider/ratio";
import clsx from "clsx";
import React from "react";

export type MenuProps = {
    className?: string;
    children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export default function GameMenu({className, children, ...props}: MenuProps) {
    const {ratio} = useRatio();

    return (
        <div
            style={{
                transform: `scale(${ratio.state.scale})`,
                transformOrigin: "left top",
            }}
            className={clsx("w-full h-full")}
        >
            <div
                className={clsx(
                    "z-20",
                    className
                )}
                {...props}
            >
                {children}
            </div>
        </div>
    );
}
