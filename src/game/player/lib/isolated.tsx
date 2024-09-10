import clsx from "clsx";
import {ReactNode} from "react";
import {useAspectRatio} from "@player/provider/ratio";

export default function Isolated(
    {children, className}: Readonly<{ children: ReactNode, className?: string }>
) {
    const {ratio} = useAspectRatio();
    return (
        <div className={
            clsx("inset-0 flex items-center justify-center", className)
        } style={{
            width: '100%',
            height: '100%',
            minWidth: `${ratio.min.w}px`,
            minHeight: `${ratio.min.h}px`,
        }}>
            <div style={{
                width: `${ratio.w}px`,
                height: `${ratio.h}px`,
                position: 'relative'
            }}>
                {children}
            </div>
        </div>
    )
}