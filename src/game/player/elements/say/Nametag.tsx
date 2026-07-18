import React from "react";
import { DialogContext } from "./context";
import { toHex } from "@lib/util/data";
import type { Character } from "@core/elements/character";
import type { NvlDialogEntry } from "@player/gameState";
import type { Color } from "@lib/game/nlcore/types";

export type NametagProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "color"> & {
    entry?: NvlDialogEntry;
    character?: Character | null;
    name?: React.ReactNode;
    color?: Color;
    children?: React.ReactNode;
};

export default function Nametag({
    entry,
    character,
    name,
    color,
    children,
    style,
    ...props
}: Readonly<NametagProps>) {
    const dialogContext = React.useContext(DialogContext);
    const targetCharacter = character ?? entry?.character ?? dialogContext?.config.action.character ?? null;
    const resolvedColor = color ?? targetCharacter?.config.color;
    const content = children ?? name ?? targetCharacter?.state.name;

    return (
        <div
            {...props}
            style={{
                color: resolvedColor ? toHex(resolvedColor) : undefined,
                ...style,
            }}
        >
            {content}
        </div>
    );
}


