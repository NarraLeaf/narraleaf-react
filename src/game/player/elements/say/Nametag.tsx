import React from "react";
import { useSentenceContext } from "./context";
export default function Nametag({
    ...props
}: Readonly<React.HTMLAttributes<HTMLDivElement>>) {
    const {
        sentence,
    } = useSentenceContext();

    return (
        <>
            <div {...props}>
                {sentence.config.character?.state.name}
            </div>
        </>
    );
}


