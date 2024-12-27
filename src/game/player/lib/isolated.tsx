"use client";

import React, {ReactNode} from "react";

import clsx from "clsx";
import {useRatio} from "@player/provider/ratio";

export default function Isolated(
    {children, className, props, style, $ref}:
        Readonly<{
            children: ReactNode;
            className?: string;
            props?: Record<any, any>;
            style?: React.CSSProperties;
            $ref?: React.RefObject<HTMLDivElement>;
        }>
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
        >
            <div
                style={{
                    ...styles,
                    position: "relative",
                    ...(props?.style || {}),
                    ...(style || {}),
                }}
                {...(props || {})}
                ref={$ref}
            >
                {children}
            </div>
        </div>
    );
}