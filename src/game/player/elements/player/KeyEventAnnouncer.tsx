import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {Game} from "@core/common/game";
import {useRouter} from "@player/lib/PageRouter/router";
import { usePreference } from "../../libElements";
import { KeyBindingType } from "@lib/game/nlcore/game/types";
import { useKeyBinding } from "../../lib/keyMap";
import { SkipKeySignal } from "./skipKeySignal";

/**@internal */
export function KeyEventAnnouncer({state}: Readonly<{
    state: GameState;
}>) {
    const game = useGame();
    const router = useRouter();

    const [skipDelay] = usePreference(Game.Preferences.skipDelay);
    const [skipInterval] = usePreference(Game.Preferences.skipInterval);
    const [skipKeyBinding] = useKeyBinding(KeyBindingType.skipAction);

    useEffect(() => {
        const playerElement = game.getLiveGame().gameState!.playerCurrent;
        if (!playerElement) {
            state.logger.warn("KeyEventAnnouncer", "Failed to listen to playerElement events");
            return;
        }
        if (!window) {
            state.logger.warn("KeyEventAnnouncer", "Failed to listen to window events");
            return;
        }

        /**
         * The press is one advance and the hold is the skip mode - see {@link SkipKeySignal}.
         *
         * The first emission is deliberately unforced. A tap of the skip key used to force, which
         * made it the only input in the game that walked past the pauses an author wrote, and made
         * the line it settled report itself as skipped.
         */
        const signal = new SkipKeySignal(
            (forced: boolean) => {
                state.events.emit(GameState.EventTypes["event:state.player.skip"], forced);
            },
            { delay: skipDelay, interval: skipInterval },
        );

        const handleKeyDown = (event: KeyboardEvent) => {
            // Something drawn over the line is holding it - see `GameState.suspendAdvance`. Skipping
            // past a popup the player just opened is the same mistake as advancing past it, only
            // faster.
            if (state.isAdvanceSuspended()) {
                return;
            }
            if (game.keyMap.match(KeyBindingType.skipAction, event.key)
                && game.preference.getPreference(Game.Preferences.skip)
            ) {
                // The OS repeats key-down while the key is held; only the first is a new press.
                if (!signal.isHeld()) {
                    state.logger.verbose("KeyEventAnnouncer", "Skipping");
                }
                signal.press();
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (game.keyMap.match(KeyBindingType.skipAction, event.key)) {
                signal.release();
            }
        };

        if (game.config.useWindowListener) {
            const cancelKeyDown = game.getLiveGame().onWindowEvent("keydown", handleKeyDown).cancel;
            const cancelKeyUp = game.getLiveGame().onWindowEvent("keyup", handleKeyUp).cancel;
            return () => {
                signal.dispose();
                cancelKeyDown();
                cancelKeyUp();
            };
        } else {
            const cancelKeyDown = game.getLiveGame().onPlayerEvent("keydown", handleKeyDown).cancel;
            const cancelKeyUp = game.getLiveGame().onPlayerEvent("keyup", handleKeyUp).cancel;
            return () => {
                signal.dispose();
                cancelKeyDown();
                cancelKeyUp();
            };
        }
    }, [router, skipDelay, skipInterval, skipKeyBinding]);

    return (<></>);
}
