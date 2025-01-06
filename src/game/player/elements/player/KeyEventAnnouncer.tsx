import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {throttle} from "@lib/util/data";
import {Game} from "@core/common/game";
import {Router} from "@player/lib/PageRouter/router";

/**@internal */
export function KeyEventAnnouncer({state, router}: Readonly<{
    state: GameState;
    router?: Router;
}>) {
    const {game} = useGame();

    useEffect(() => {
        const playerElement = game.getLiveGame().gameState!.playerCurrent;
        if (!playerElement) {
            state.logger.warn("KeyEventAnnouncer", "Failed to listen to playerElement events");
            return;
        }

        const listener = throttle((event: KeyboardEvent) => {
            if (game.config.player.skipKey.includes(event.key)
                && game.preference.getPreference(Game.Preferences.skip)
                && (!router || !router.isActive())
            ) {
                state.events.emit(GameState.EventTypes["event:state.player.skip"]);
            }
        }, game.config.player.skipInterval);
        return game.getLiveGame().onPlayerEvent("keydown", listener).cancel;
    }, [router]);

    return (<></>);
}