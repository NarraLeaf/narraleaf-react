import React, { useEffect, useMemo, useState } from "react";
import { useNvlDialogs } from "./NvlContext";
import { NvlDialogListProps, NvlDialogItemProps } from "./type";
import clsx from "clsx";
import { useGame } from "@lib/game/player/provider/game-state";
import { toHex } from "@lib/util/data";
import { Script } from "@core/elements/script";
import { DialogContext } from "../say/context";
import { DialogState } from "../say/UIDialog";
import { Texts } from "../say/Sentence";
import Nametag from "../say/Nametag";
import { GameState, NvlDialogEntry } from "@player/gameState";
import { KeyBindingType } from "@lib/game/nlcore/game/types";
import { useKeyBinding } from "../../lib/keyMap";

export function NvlDialogList({ children, className, style, renderDialogItem }: NvlDialogListProps) {
    const dialogs = useNvlDialogs();

    return (
        <div
            data-element-type="nvl-dialog-list"
            className={clsx(
                "flex flex-col space-y-4 p-4",
                className
            )}
            style={style}
        >
            {dialogs.map((entry, index) => (
                <div key={entry.id}>
                    <NvlDialogItemProvider entry={entry}>
                        {renderDialogItem ? (
                            renderDialogItem({
                                entry,
                                index,
                                isActive: dialogs[dialogs.length - 1]?.id === entry.id,
                                nametag: entry.character ? (
                                    <Nametag className="nvl-character-name font-bold mr-2" />
                                ) : null,
                                texts: <Texts className="nvl-dialog-text" />,
                            })
                        ) : children ? (
                            React.Children.map(children, child => {
                                if (React.isValidElement(child)) {
                                    return React.cloneElement(child as React.ReactElement<NvlDialogItemProps>, {
                                        entry,
                                        index,
                                    });
                                }
                                return child;
                            })
                        ) : (
                            <DefaultNvlDialogItem entry={entry} index={index} />
                        )}
                    </NvlDialogItemProvider>
                </div>
            ))}
        </div>
    );
}

export function DefaultNvlDialogItem({ entry, index, className, style, texts }: NvlDialogItemProps & { texts?: React.ReactNode }) {
    const game = useGame();
    const characterName = entry.character?.state.name || null;
    const characterColor = toHex(entry.character?.config.color || game.config.defaultTextColor);
    const textContent = texts ?? <Texts className="nvl-dialog-text" />;

    return (
        <div
            data-element-type="nvl-dialog-item"
            data-dialog-index={index}
            className={clsx(
                "nvl-dialog-item",
                className
            )}
            style={style}
        >
            {characterName && (
                <span
                    className="nvl-character-name font-bold mr-2"
                    style={{ color: characterColor }}
                >
                    {characterName}:
                </span>
            )}
            {textContent}
        </div>
    );
}

function NvlDialogItemProvider({ entry, children }: { entry: NvlDialogEntry; children: React.ReactNode }) {
    const game = useGame();
    const dialogs = useNvlDialogs();
    const gameState = game.getLiveGame().getGameState()!;
    const [nextKeyBinding] = useKeyBinding(KeyBindingType.nextAction);
    const words = useMemo(() => entry.sentence.evaluate(Script.getCtx({ gameState })), [entry.sentence, gameState]);
    const isActive = dialogs[dialogs.length - 1]?.id === entry.id;
    const useTypeEffect = isActive && gameState.getNvlState().activeDialogId === entry.id;
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
            const nvlState = gameState.getNvlState();
            if (!isActive || nvlState.activeDialogId !== entry.id) {
                return;
            }
            dialogState.requestComplete();
        };
        const handleSkip = () => {
            const nvlState = gameState.getNvlState();
            if (!isActive || nvlState.activeDialogId !== entry.id) {
                return;
            }
            dialogState.forceSkip();
        };
        const stageToken = gameState.events.on(GameState.EventTypes["event:state.player.stageClick"], handleClick);
        const skipToken = gameState.events.on(GameState.EventTypes["event:state.player.skip"], handleSkip);

        return () => {
            stageToken.cancel();
            skipToken.cancel();
        };
    }, [dialogState, gameState, isActive]);

    useEffect(() => {
        if (!isActive) {
            return;
        }
        const handleKeyUp = (event: KeyboardEvent) => {
            if (!game.keyMap.match(KeyBindingType.nextAction, event.key)) {
                return;
            }
            const nvlState = gameState.getNvlState();
            if (!isActive || nvlState.activeDialogId !== entry.id) {
                return;
            }
            dialogState.requestComplete();
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
        const completeToken = dialogState.events.on(DialogState.Events.complete, (force: boolean) => {
            if (!isActive) {
                return;
            }
            const nvlState = gameState.getNvlState();
            if (nvlState.activeDialogId === entry.id) {
                gameState.setNvlTyping(false);
                gameState.events.emit(GameState.EventTypes["event:state.nvl.dialogComplete"], entry.id);
            }
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
            const nvlState = gameState.getNvlState();
            if (isActive && nvlState.activeDialogId === entry.id) {
                dialogState.requestComplete();
            }
        });
        return () => {
            token.cancel();
        };
    }, [dialogState, isActive]);

    return (
        <DialogContext value={dialogState}>
            {children}
        </DialogContext>
    );
}

export default NvlDialogList;
