import React from "react";
import { useDialogContext } from "./context";
import { toHex } from "@lib/util/data";
import { useGame } from "@lib/game/nlcore/common/core";

export default function Nametag({
    ...props
}: Readonly<React.HTMLAttributes<HTMLDivElement>>) {
    const {
        config,
    } = useDialogContext();
    const game = useGame();

    return (
        <>
            <div {...props}>
                <span style={{
                    color: toHex(config.action.character?.config.color || game.config.defaultNametagColor),
                }}>
                    {config.action.character?.state.name}
                </span>
            </div>
        </>
    );
}


