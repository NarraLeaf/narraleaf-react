import React from "react";
import {useRatio} from "@player/provider/ratio";
import Isolated from "@player/lib/isolated";
import clsx from "clsx";

type ForwardSize = {
    width?: React.CSSProperties["width"];
    height?: React.CSSProperties["height"];
};

type ForwardChildren = {
    children?: React.ReactNode;
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
            className
        )} style={{
            width,
            height,
            transform: `scale(${ratio.state.scale})`,
            transformOrigin: `${alignX} ${alignY}`,
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
};
