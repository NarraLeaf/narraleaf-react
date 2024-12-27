import React from "react";
import {useRatio} from "@player/provider/ratio";
import Isolated from "@player/lib/isolated";
import clsx from "clsx";
import {useGame} from "@player/provider/game-state";

type ForwardSize = {
    width?: React.CSSProperties["width"];
    height?: React.CSSProperties["height"];
};

type ForwardChildren = {
    children?: React.ReactNode;
};

type ForwardClassName = {
    className?: string;
};

type FrameComponentProps = ForwardSize & ForwardChildren;

function BaseFrame(
    {
        alignX = "center",
        alignY = "center",
        children,
        width,
        height,
        className,
    }: Readonly<{
        alignX?: "left" | "center" | "right",
        alignY?: "top" | "center" | "bottom",
        className?: string,
    } & ForwardSize & ForwardChildren>
) {
    const {ratio} = useRatio();

    const justifyContent = alignX === "left" ? "justify-start" : alignX === "right" ? "justify-end" : "justify-center";
    const alignItems = alignY === "top" ? "items-start" : alignY === "bottom" ? "items-end" : "items-center";

    return (
        <Isolated className={clsx(
            "flex absolute",
            justifyContent,
            alignItems,
            className,
            "pointer-events-none"
        )} style={{
            width,
            height,
            transform: `scale(${ratio.state.scale})`,
            transformOrigin: `${alignX} ${alignY}`,
            pointerEvents: "all"
        }}>
            {children}
        </Isolated>
    );
}

const TopLeft = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"left"} alignY={"top"}/>;
const TopCenter = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"center"} alignY={"top"}/>;
const TopRight = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"right"} alignY={"top"}/>;
const CenterLeft = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"left"} alignY={"center"}/>;
const CenterCenter = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"center"} alignY={"center"}/>;
const CenterRight = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"right"} alignY={"center"}/>;
const BottomLeft = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"left"} alignY={"bottom"}/>;
const BottomCenter = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"center"} alignY={"bottom"}/>;
const BottomRight = (props: FrameComponentProps) => <BaseFrame {...props} alignX={"right"} alignY={"bottom"}/>;

function Full({children, className}: ForwardChildren & ForwardClassName) {
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
            <div style={{
                pointerEvents: "all",
            }}>
                <div className={clsx("absolute", className)}>
                    {children}
                </div>
            </div>
        </Isolated>
    );
}

const Top = {
    Left: TopLeft,
    Center: TopCenter,
    Right: TopRight,
};
const Center = {
    Left: CenterLeft,
    Center: CenterCenter,
    Right: CenterRight,
};
const Bottom = {
    Left: BottomLeft,
    Center: BottomCenter,
    Right: BottomRight,
};

export {
    Top,
    Center,
    Bottom,
    Full,
};
