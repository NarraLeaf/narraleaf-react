import React, {useEffect, useRef} from "react";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {Game} from "@core/common/game";
import {useRouter} from "@player/lib/PageRouter/router";

/**@internal */
export function KeyEventAnnouncer({state}: Readonly<{
    state: GameState;
}>) {
    const game = useGame();
    const router = useRouter();
    const keyIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isKeyPressedRef = useRef<boolean>(false);

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

        const handleKeyDown = (event: KeyboardEvent) => {
            if (game.config.skipKey.includes(event.key)
                && game.preference.getPreference(Game.Preferences.skip)
                && (!router || !router.isActive())
            ) {
                if (!isKeyPressedRef.current) {
                    isKeyPressedRef.current = true;
                    // Trigger immediately on first press
                    state.events.emit(GameState.EventTypes["event:state.player.skip"]);
                    
                    // Start interval for continuous triggering
                    keyIntervalRef.current = setInterval(() => {
                        state.events.emit(GameState.EventTypes["event:state.player.skip"]);
                    }, game.config.skipInterval);
                }
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (game.config.skipKey.includes(event.key)) {
                isKeyPressedRef.current = false;
                if (keyIntervalRef.current) {
                    clearInterval(keyIntervalRef.current);
                    keyIntervalRef.current = null;
                }
            }
        };

        const cleanup = () => {
            if (keyIntervalRef.current) {
                clearInterval(keyIntervalRef.current);
                keyIntervalRef.current = null;
            }
        };

        if (game.config.useWindowListener) {
            const cancelKeyDown = game.getLiveGame().onWindowEvent("keydown", handleKeyDown).cancel;
            const cancelKeyUp = game.getLiveGame().onWindowEvent("keyup", handleKeyUp).cancel;
            return () => {
                cleanup();
                cancelKeyDown();
                cancelKeyUp();
            };
        } else {
            const cancelKeyDown = game.getLiveGame().onPlayerEvent("keydown", handleKeyDown).cancel;
            const cancelKeyUp = game.getLiveGame().onPlayerEvent("keyup", handleKeyUp).cancel;
            return () => {
                cleanup();
                cancelKeyDown();
                cancelKeyUp();
            };
        }
    }, [router]);

    return (<></>);
}