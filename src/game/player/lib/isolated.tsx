"use client";

import React, {ReactNode} from "react";

import clsx from "clsx";
import {useRatio} from "@player/provider/ratio";

export default function Isolated(
    {children, className, style, ref, ...props}:
        Readonly<{
            children: ReactNode;
            className?: string;
            style?: React.CSSProperties;
            ref?: React.RefObject<HTMLDivElement | null>;
        } & React.HTMLAttributes<HTMLDivElement>
    >
) {
    const {ratio} = useRatio();
    const styles = ratio.getStyle();

    return (
        <div
            className={
                clsx("inset-0", className)
            }
            style={{
                width: "100%",
                height: "100%",
                minWidth: `${ratio.state.minWidth}px`,
                minHeight: `${ratio.state.minHeight}px`,
            }}
            {...props}
        >
            <div
                style={{
                    ...styles,
                    position: "relative",
                    ...(style || {}),
                }}
                {...(props || {})}
                ref={ref}
            >
                {children}
            </div>
        </div>
    );
}