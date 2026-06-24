import React, { useMemo } from "react";
import { useNvl, useNvlDialogs } from "./NvlContext";
import { NvlDialogListProps, NvlDialogItemProps } from "./type";
import clsx from "clsx";
import { useGame } from "@lib/game/player/provider/game-state";
import { toHex } from "@lib/util/data";
import { Script } from "@core/elements/script";
import { DialogContext } from "../say/context";
import { Texts } from "../say/Sentence";
import Nametag from "../say/Nametag";
import { NvlDialogEntry } from "@player/gameState";
import { useNvlDialogState } from "./useNvlDialogState";

export function NvlDialogList({ children, className, style, renderDialogItem }: NvlDialogListProps) {
    const dialogs = useNvlDialogs();
    const { state } = useNvl();

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
                <div key={`${entry.id}:${state.activeDialogId === entry.id ? state.phase : "idle"}`}>
                    <NvlDialogItemProvider entry={entry}>
                        {renderDialogItem ? (
                            renderDialogItem({
                                entry,
                                index,
                                isActive: state.activeDialogId === entry.id,
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
    const gameState = game.getLiveGame().getGameState()!;
    const words = useMemo(() => entry.sentence.evaluate(Script.getCtx({ gameState })), [entry.sentence, gameState]);
    const nvlState = gameState.getNvlState();
    const isActive = nvlState.activeDialogId === entry.id;
    const useTypeEffect = isActive && nvlState.phase === "typing";
    const dialogState = useNvlDialogState({
        entry,
        gameState,
        words,
        isActive,
        useTypeEffect,
    });

    return (
        <DialogContext value={dialogState}>
            {children}
        </DialogContext>
    );
}

export default NvlDialogList;
