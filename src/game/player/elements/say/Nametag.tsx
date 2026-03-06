import React from "react";
import { DialogContext } from "./context";
import { toHex } from "@lib/util/data";
import { useGame } from "@lib/game/nlcore/common/core";
import type { Character } from "@core/elements/character";
import type { NvlDialogEntry } from "@player/gameState";

type NametagProps = React.HTMLAttributes<HTMLDivElement> & {
    entry?: NvlDialogEntry;
    character?: Character | null;
};

export default function Nametag({
    entry,
    character,
    ...props
}: Readonly<NametagProps>) {
    const dialogContext = React.useContext(DialogContext);
    const game = useGame();
    const targetCharacter = character ?? entry?.character ?? dialogContext?.config.action.character ?? null;

    return (
        <>
            <div {...props}>
                <span style={{
                    color: toHex(targetCharacter?.config.color || game.config.defaultNametagColor),
                }}>
                    {targetCharacter?.state.name}
                </span>
            </div>
        </>
    );
}


