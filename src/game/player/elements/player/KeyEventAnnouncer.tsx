import React, {useEffect, useRef} from "react";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {Game} from "@core/common/game";
import {useRouter} from "@player/lib/PageRouter/router";
import { usePreference } from "../../libElements";

/**@internal */
export function KeyEventAnnouncer({state}: Readonly<{
    state: GameState;
}>) {
    const game = useGame();
    const router = useRouter();
    const keyIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isKeyPressedRef = useRef<boolean>(false);
    
    const [skipDelay] = usePreference(Game.Preferences.skipDelay);
    const [skipInterval] = usePreference(Game.Preferences.skipInterval);

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

        const cleanup = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            if (keyIntervalRef.current) {
                clearInterval(keyIntervalRef.current);
                keyIntervalRef.current = null;
            }
            isKeyPressedRef.current = false;
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (game.config.skipKey.includes(event.key)
                && game.preference.getPreference(Game.Preferences.skip)
                && (!router || !router.isActive())
            ) {
                if (!isKeyPressedRef.current) {
                    state.logger.verbose("KeyEventAnnouncer", "Skipping");
                    
                    const startContinuousSkip = () => {
                        keyIntervalRef.current = setInterval(() => {
                            state.events.emit(GameState.EventTypes["event:state.player.skip"], false);
                        }, skipInterval);
                    };

                    // Clean up any existing timers before starting new ones
                    cleanup();

                    // Trigger immediately on first press
                    state.events.emit(GameState.EventTypes["event:state.player.skip"], false);
                    isKeyPressedRef.current = true;

                    if (skipDelay === 0) {
                        startContinuousSkip();
                    } else {
                        timeoutRef.current = setTimeout(startContinuousSkip, skipDelay);
                    }
                }
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (game.config.skipKey.includes(event.key)) {
                cleanup();
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
    }, [router, skipDelay, skipInterval]);

    return (<></>);
}