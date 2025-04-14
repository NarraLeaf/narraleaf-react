import React from "react";
import { useSentenceContext } from "./context";
import { toHex } from "@lib/util/data";
import { useGame } from "@lib/game/nlcore/common/core";

export default function Nametag({
    ...props
}: Readonly<React.HTMLAttributes<HTMLDivElement>>) {
    const {
        sentence,
    } = useSentenceContext();
    const game = useGame();

    return (
        <>
            <div {...props}>
                <span style={{
                    color: toHex(sentence.config.character?.config.color || game.config.defaultNametagColor),
                }}>
                    {sentence.config.character?.state.name}
                </span>
            </div>
        </>
    );
}


