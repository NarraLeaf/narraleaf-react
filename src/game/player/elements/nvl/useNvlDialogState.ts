import { useCallback, useEffect, useState } from "react";
import { useGame } from "@lib/game/player/provider/game-state";
import { DialogState } from "../say/UIDialog";
import { applyNvlAdvance } from "./nvlAdvance";
import { useKeyBinding } from "../../lib/keyMap";
import { KeyBindingType } from "@lib/game/nlcore/game/types";
import { GameState } from "@player/gameState";
import type { NvlDialogEntry } from "@player/gameState";
import type { Word } from "@core/elements/character/word";
import type { Pausing } from "@core/elements/character/pause";
import type { TextEvent } from "@core/elements/character/textEvent";

type UseNvlDialogStateParams = {
    entry: NvlDialogEntry;
    gameState: GameState;
    words: Word<Pausing | string | TextEvent>[];
    isActive: boolean;
    useTypeEffect: boolean;
};

export function useNvlDialogState({
    entry,
    gameState,
    words,
    isActive,
    useTypeEffect,
}: UseNvlDialogStateParams) {
    const game = useGame();
    const [nextKeyBinding] = useKeyBinding(KeyBindingType.nextAction);
    const [dialogState] = useState(() => {
        // The fire guard lives on the long-lived entry, not this dialog state (which is re-created on
        // every re-mount), so a line's tokens fire once and a re-mount replays no sound / expression.
        const firedTextEvents = entry.firedTextEvents ?? (entry.firedTextEvents = new Set<TextEvent>());
        return new DialogState({
            useTypeEffect,
            action: {
                sentence: entry.sentence,
                character: entry.character,
                words,
                id: entry.id,
            },
            evaluatedWords: words,
            gameState,
            firedTextEvents,
        });
    });

    /**
     * Every way a player asks an NVL line to get on with it, in one place.
     *
     * A click on the stage, the advance key, a host calling `simulateClick` and the skip key all
     * used to walk the same two steps by hand, and the skip key was the one that walked them
     * differently: it forced. Forcing steps over a `Pause`, which is what holding the skip key is
     * for and not what a tap of it asks - see {@link applyNvlAdvance}.
     *
     * The page state moves first and unconditionally. `requestNvlAdvance` is not a query: in
     * `awaitAdvance` it settles the line itself and answers `advance`, and it answers `typing` only
     * while there is text left to reveal, which is the case this dialog has anything to say about.
     */
    const advance = useCallback((forced: boolean) => {
        applyNvlAdvance(gameState, dialogState, { dialogId: entry.id, active: isActive, forced });
    }, [dialogState, entry.id, gameState, isActive]);

    useEffect(() => {
        if (!isActive) {
            return;
        }
        const stageToken = gameState.events.on(
            GameState.EventTypes["event:state.player.stageClick"], () => advance(false)
        );
        const skipToken = gameState.events.on(
            GameState.EventTypes["event:state.player.skip"], (force?: boolean) => advance(force === true)
        );

        return () => {
            stageToken.cancel();
            skipToken.cancel();
        };
    }, [advance, gameState, isActive]);

    useEffect(() => {
        if (!isActive) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ignore OS auto-repeat so holding the key advances only once per press
            if (event.repeat) return;
            if (!game.keyMap.match(KeyBindingType.nextAction, event.key)) {
                return;
            }
            advance(false);
        };

        if (game.config.useWindowListener) {
            const token = game.getLiveGame().onWindowEvent("keydown", handleKeyDown);
            return () => {
                token.cancel();
            };
        }
        const token = game.getLiveGame().onPlayerEvent("keydown", handleKeyDown);
        return () => {
            token.cancel();
        };
    }, [advance, game, isActive, nextKeyBinding]);

    useEffect(() => {
        const completeToken = dialogState.events.on(DialogState.Events.complete, (force?: boolean) => {
            if (!isActive) {
                return;
            }
            gameState.completeNvlTyping(entry.id);
            if (!dialogState.isIdle() && !force) {
                dialogState.setIdle(true);
            }
        });

        return () => {
            completeToken.cancel();
        };
    }, [dialogState, entry.id, gameState, isActive]);

    useEffect(() => {
        const token = dialogState.events.on(DialogState.Events.simulateClick, () => advance(false));
        return () => {
            token.cancel();
        };
    }, [advance, dialogState]);

    return dialogState;
}
