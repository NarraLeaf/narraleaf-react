import React from "react";
import clsx from "clsx";
import {useRatio} from "@player/provider/ratio";
import Inspect from "@player/lib/Inspect";

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
    }: Readonly<{
        alignX?: "left" | "center" | "right",
        alignY?: "top" | "center" | "bottom",
        className?: string,
    } & ForwardSize & ForwardChildren>
) {
    const {ratio} = useRatio();

    const positions = {
        top: alignY === "top" ? "0" : alignY === "center" ? "50%" : undefined,
        left: alignX === "left" ? "0" : alignX === "center" ? "50%" : undefined,
        right: alignX === "right" ? "0" : undefined,
        bottom: alignY === "bottom" ? "0" : undefined,
    };
    const transform = {
        x: alignX === "center" ? "-50%" : "0",
        y: alignY === "center" ? "-50%" : "0",
    };

    return (
        <>
            <Inspect.Div
                color={"gray"}
                border={"dashed"}
                className={clsx(
                    "absolute",
                )}
                style={{
                    ...positions,
                    width,
                    height,
                    transform: `scale(${ratio.state.scale}) translate(${transform.x}, ${transform.y})`,
                    transformOrigin: `${alignX} ${alignY}`,
                }}
            >
                {children}
            </Inspect.Div>
        </>
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
