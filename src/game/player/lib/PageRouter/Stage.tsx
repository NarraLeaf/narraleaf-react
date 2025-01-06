import React from "react";
import {Full} from "@player/lib/PlayerFrames";


export function Stage(
    {
        children,
        className,
        style,
    }: Readonly<{
        children?: React.ReactNode;
        className?: string;
        style?: React.CSSProperties;
    }>
) {
    return (
        <>
            <Full style={style} className={className}>
                {children}
            </Full>
        </>
    );
}

