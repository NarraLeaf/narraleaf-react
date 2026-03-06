import React from "react";
import { NvlContainer } from "./NvlContainer";
import { INvlContainerProps } from "./type";
import Nametag from "../say/Nametag";
import { Texts } from "../say/Sentence";

export function DefaultNvlContainer({ renderDialogItem, dialogs }: INvlContainerProps) {
    const dialogItems = dialogs ?? [];
    return (
        <NvlContainer
            className="bg-black/80 text-white p-16 inset-8"
        >
            <div
                data-element-type="nvl-dialog-list"
                className="flex flex-col space-y-4 p-4"
            >
                {dialogItems.map((dialog, index) => {
                    const nametag = dialog.entry.character ? (
                        <Nametag className="nvl-character-name font-bold mr-2" entry={dialog.entry} />
                    ) : null;
                    const texts = (
                        <Texts
                            className="nvl-dialog-text"
                            entry={dialog.entry}
                            gameState={dialog.gameState}
                            words={dialog.words}
                            useTypeEffect={dialog.useTypeEffect}
                            isActive={dialog.isActive}
                        />
                    );
                    return (
                        <div
                            key={`${dialog.entry.id}:${dialog.isActive ? "active" : "idle"}`}
                            data-element-type="nvl-dialog-item"
                            data-dialog-index={index}
                            className="nvl-dialog-item"
                        >
                            {renderDialogItem ? renderDialogItem({
                                entry: dialog.entry,
                                index,
                                isActive: dialog.isActive,
                                nametag,
                                texts,
                            }) : (
                                <>
                                    {nametag}
                                    {texts}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </NvlContainer>
    );
}

export default DefaultNvlContainer;
