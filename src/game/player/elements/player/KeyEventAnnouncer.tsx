import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {throttle} from "@lib/util/data";

export function KeyEventAnnouncer({state}: Readonly<{
    state: GameState;
}>) {
    const {game} = useGame();

    useEffect(() => {
        if (!window) {
            state.logger.warn("NarraLeaf-React: Announcer", "Cannot listen to window events");
            return;
        }

        const listener = throttle((event: KeyboardEvent) => {
            if (game.config.player.skipKey.includes(event.key)) {
                state.events.emit(GameState.EventTypes["event:state.player.skip"]);
            }
        }, game.config.player.skipInterval);
        window.addEventListener("keydown", listener);

        return () => {
            window.removeEventListener("keydown", listener);
        };
    }, []);

    return (<></>);
}