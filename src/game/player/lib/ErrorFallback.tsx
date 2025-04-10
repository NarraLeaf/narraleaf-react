import React, {ErrorInfo} from "react";
import {useGame} from "@player/provider/game-state";

export default function ErrorFallback({error, errorInfo}: { error: Error, errorInfo: ErrorInfo }) {
    const {game} = useGame();

    if (game.config.onError) {
        game.config.onError(error);
    }

    if (game.config.app.debug) {
        return (
            <div className={"text-left"}>
                <h1>NarraLeaf-React cannot initialize the player correctly. (development mode)</h1>
                <p className={"text-red-700"}>Message: {error.message}</p>
                <pre>Error Stack: {error?.stack}</pre>
                <pre>Component Stack: {errorInfo?.componentStack}</pre>
                <pre>Digest: {errorInfo?.digest}</pre>
            </div>
        );
    }

    return (
        <div className="bg-white w-full h-full">
            <h1>NarraLeaf-React crashed due to an unknown error.</h1>
            <p>Please contact the game developer for further assistance.</p>
        </div>
    );
}
