"use client";

import React, {ReactNode, useEffect} from "react";

import clsx from "clsx";
import {useRatio} from "@player/provider/ratio";

export default function Isolated(
    {children, className}: Readonly<{ children: ReactNode, className?: string }>
) {
    const {ratio} = useRatio();
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    useEffect(() => {
        return ratio.onUpdate(() => {
            forceUpdate();
        });
    });

    const styles = ratio.getStyle();

    return (
        <div className={
            clsx("inset-0 flex items-center justify-center", className)
        } style={{
            width: "100%",
            height: "100%",
            minWidth: `${ratio.state.minWidth}px`,
            minHeight: `${ratio.state.minHeight}px`,
        }}>
            <div style={{
                ...styles,
                position: "relative"
            }}>
                {children}
            </div>
        </div>
    );
}