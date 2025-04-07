import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {throttle} from "@lib/util/data";
import {Game} from "@core/common/game";
import {useRouter} from "@player/lib/PageRouter/router";

/**@internal */
export function KeyEventAnnouncer({state}: Readonly<{
    state: GameState;
}>) {
    const {game} = useGame();
    const router = useRouter();

    useEffect(() => {
        const playerElement = game.getLiveGame().gameState!.playerCurrent;
        if (!playerElement) {
            state.logger.warn("KeyEventAnnouncer", "Failed to listen to playerElement events");
            return;
        }

        const listener = throttle((event: KeyboardEvent) => {
            if (game.config.skipKey.includes(event.key)
                && game.preference.getPreference(Game.Preferences.skip)
                && (!router || !router.isActive())
            ) {
                state.logger.verbose("KeyEventAnnouncer", "Emitted event: state.player.skip");
                state.events.emit(GameState.EventTypes["event:state.player.skip"]);
            }
        }, game.config.skipInterval);
        return game.getLiveGame().onPlayerEvent("keydown", listener).cancel;
    }, [router]);

    return (<></>);
}