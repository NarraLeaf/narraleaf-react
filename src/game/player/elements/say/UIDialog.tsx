import React from "react";
import { SayContext } from "./context";
import { SayElementProps } from "./type";

export default function UIDialog({
    action,
    onClick,
    useTypeEffect = true,
    gameState,
    children,
}: Readonly<React.PropsWithChildren<SayElementProps>>) {
    return (
        <SayContext value={{
            action,
            onClick,
            useTypeEffect,
            gameState,
        }}>
            {children}
        </SayContext>
    );
}
