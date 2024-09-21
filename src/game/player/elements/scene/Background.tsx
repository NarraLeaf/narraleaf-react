import clsx from "clsx";
import {useRatio} from "@player/provider/ratio";
import type {ReactNode} from "react";
import React, {useEffect, useRef} from "react";
import {useGame} from "@player/provider/game-state";

export default function Background({
                                       children
                                   }: Readonly<{
    children: ReactNode;
}>) {
    const {ratio} = useRatio();
    const {game} = useGame();
    const contentContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const contentContainer = contentContainerRef.current;
        if (!contentContainer) {
            throw new Error("Content container not found");
        }
    }, [game.config.player.contentContainerId]);

    return (
        <>
            <div
                ref={contentContainerRef}
                className={clsx("absolute inset-0 flex items-center justify-center bg-cover bg-center overflow-hidden")}
                style={{
                    ...ratio.getStyle(),
                    // ...(clientWidth > ratio.state.minWidth ? {
                    //     left: "50%",
                    // } : {}),
                    // ...(clientHeight > ratio.state.minHeight ? {
                    //     top: "50%",
                    // } : {}),
                    // transform: `translate(${clientWidth > ratio.state.minWidth ? "-50%" : "0"}, ${clientHeight > ratio.state.minHeight ? "-50%" : "0"})`,
                }}
            >
                {children}
            </div>
        </>
    );
};