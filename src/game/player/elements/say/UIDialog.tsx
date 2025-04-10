import React, { useState } from "react";
import { SayContext } from "./context";
import { SayComponent } from "@player/type";
import { PlayerDialogProps } from "./type";

export default function PlayerDialog({
    action,
    onClick,
    useTypeEffect = true,
    gameState,
}: Readonly<PlayerDialogProps>) {
    const [isFinished, setIsFinished] = useState(false);
    const DialogConstructor: SayComponent = gameState.game.config.dialog;

    const onFinished = () => {
        setIsFinished(true);
    };

    return (
        <SayContext value={{
            action,
            onClick,
            onFinished,
            useTypeEffect,
            gameState,
        }}>
            <DialogConstructor isFinished={isFinished}/>
        </SayContext>
    );
}
