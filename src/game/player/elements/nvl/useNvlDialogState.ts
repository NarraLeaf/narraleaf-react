import { useEffect, useState } from "react";
import { useGame } from "@lib/game/player/provider/game-state";
import { DialogState } from "../say/UIDialog";
import { useKeyBinding } from "../../lib/keyMap";
import { KeyBindingType } from "@lib/game/nlcore/game/types";
import { GameState } from "@player/gameState";
import type { NvlDialogEntry } from "@player/gameState";
import type { Word } from "@core/elements/character/word";
import type { Pausing } from "@core/elements/character/pause";

type UseNvlDialogStateParams = {
    entry: NvlDialogEntry;
    gameState: GameState;
    words: Word<Pausing | string>[];
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
    const [dialogState] = useState(() => new DialogState({
        useTypeEffect,
        action: {
            sentence: entry.sentence,
            character: entry.character,
            words,
            id: entry.id,
        },
        evaluatedWords: words,
        gameState,
    }));

    useEffect(() => {
        if (!isActive) {
            return;
        }
        const handleClick = () => {
            const result = gameState.requestNvlAdvance(entry.id);
            if (result === "typing") {
                dialogState.requestComplete();
            }
        };
        const handleSkip = () => {
            const result = gameState.requestNvlSkip(entry.id);
            if (result === "typing") {
                dialogState.forceSkip();
            }
        };
        const stageToken = gameState.events.on(GameState.EventTypes["event:state.player.stageClick"], handleClick);
        const skipToken = gameState.events.on(GameState.EventTypes["event:state.player.skip"], handleSkip);

        return () => {
            stageToken.cancel();
            skipToken.cancel();
        };
    }, [dialogState, entry.id, gameState, isActive]);

    useEffect(() => {
        if (!isActive) {
            return;
        }
        const handleKeyUp = (event: KeyboardEvent) => {
            if (!game.keyMap.match(KeyBindingType.nextAction, event.key)) {
                return;
            }
            const result = gameState.requestNvlAdvance(entry.id);
            if (result === "typing") {
                dialogState.requestComplete();
            }
        };

        if (game.config.useWindowListener) {
            const token = game.getLiveGame().onWindowEvent("keyup", handleKeyUp);
            return () => {
                token.cancel();
            };
        }
        const token = game.getLiveGame().onPlayerEvent("keyup", handleKeyUp);
        return () => {
            token.cancel();
        };
    }, [dialogState, entry.id, game, gameState, isActive, nextKeyBinding]);

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
        const token = dialogState.events.on(DialogState.Events.simulateClick, () => {
            if (!isActive) {
                return;
            }
            const result = gameState.requestNvlAdvance(entry.id);
            if (result === "typing") {
                dialogState.requestComplete();
            }
        });
        return () => {
            token.cancel();
        };
    }, [dialogState, isActive]);

    return dialogState;
}
