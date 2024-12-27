import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {throttle} from "@lib/util/data";
import {Game} from "@core/common/game";

/**@internal */
export function KeyEventAnnouncer({state}: Readonly<{
    state: GameState;
}>) {
    const {game} = useGame();

    useEffect(() => {
        if (!window) {
            state.logger.warn("NarraLeaf-React: Announcer", "Cannot listen to window events" +
                "\nThis component must be rendered in a browser environment");
            return;
        }

        const listener = throttle((event: KeyboardEvent) => {
            if (game.config.player.skipKey.includes(event.key)
                && game.preference.getPreference(Game.Preferences.skip)) {
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