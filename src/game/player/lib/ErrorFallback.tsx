import React, {ErrorInfo} from "react";
import {useGame} from "@player/provider/game-state";

export default function ErrorFallback({error, errorInfo}: { error: Error, errorInfo: ErrorInfo }) {
    const {game} = useGame();

    if (game.config.app.debug) {
        return (
            <div className={"text-left"}>
                <h1>It is my fault, NarraLeaf-React cannot initialize the player correctly.</h1>
                <p className={"text-red-700"}>Message: {error.message}</p>
                <pre>Error Stack: {error?.stack}</pre>
                <pre>Component Stack: {errorInfo?.componentStack}</pre>
                <pre>Digest: {errorInfo?.digest}</pre>
            </div>
        );
    }

    return (
        <div>
            <h1>The game cannot initialize the player correctly.</h1>
            <p>Please contact the game developer for further assistance.</p>
        </div>
    );
}
