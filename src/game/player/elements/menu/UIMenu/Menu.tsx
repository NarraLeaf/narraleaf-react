import { useRatio } from "@lib/game/player/provider/ratio";
import clsx from "clsx";
import React, { useCallback, useRef } from "react";
import { UIListContext } from "./context";

export type MenuProps = {
    className?: string;
    children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export default function GameMenu({className, children, ...props}: MenuProps) {
    const {ratio} = useRatio();
    const itemRefs = useRef<React.RefObject<HTMLElement>[]>([]);

    const register = useCallback((ref: React.RefObject<HTMLElement>) => {
      itemRefs.current.push(ref);
      return itemRefs.current.indexOf(ref);
    }, []);

    const unregister = useCallback((ref: React.RefObject<HTMLElement>) => {
        const index = itemRefs.current.indexOf(ref);
        if (index !== -1) {
            itemRefs.current.splice(index, 1);
        }
    }, []);

    const getIndex = useCallback((ref: React.RefObject<HTMLElement>) => {
        return itemRefs.current.indexOf(ref);
    }, []);

    return (
        <>
            <UIListContext value={{register, unregister, getIndex}}>
                <div
                    style={{
                        transform: `scale(${ratio.state.scale})`,
                        transformOrigin: "left top",
                    }}
                    className={clsx("w-full h-full")}
                >
                    <div
                        className={clsx(
                            "z-20",
                            className
                        )}
                        {...props}
                    >
                        {children}
                    </div>
                </div>
            </UIListContext>
        </>
    );
}
