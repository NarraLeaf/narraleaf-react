import React from "react";
import { SayContext } from "./context";
import { SayElementProps, SayComponent } from "@player/type";

export default function PlayerDialog({
    action,
    onClick,
    useTypeEffect = true,
    gameState,
}: Readonly<SayElementProps>) {
    const DialogConstructor: SayComponent = gameState.game.config.dialog;

    return (
        <SayContext value={{
            action,
            onClick,
            useTypeEffect,
            gameState,
        }}>
            <DialogConstructor/>
        </SayContext>
    );
}
