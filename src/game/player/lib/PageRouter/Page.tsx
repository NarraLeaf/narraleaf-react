import React from "react";
import {HTMLMotionProps, motion} from "motion/react";
import clsx from "clsx";
import {Full} from "@player/lib/PlayerFrames";

export type PageProps = Readonly<{
    id: string;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
} & HTMLMotionProps<"div">>;

export function Page(
    {
        id,
        children,
        className,
        style,
        ...motionProps
    }: PageProps) {

    return (
        <motion.div className={clsx("w-full h-full")} key={id} {...motionProps}>
            <Full className={className} style={style}>
                {children}
            </Full>
        </motion.div>
    );
}


