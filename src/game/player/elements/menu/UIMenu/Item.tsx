import { Word } from "@core/elements/character/word";
import { Choice } from "@core/elements/menu";
import clsx from "clsx";
import React, { useLayoutEffect, useRef, useState } from "react";
import { useUIListContext, useUIMenuContext } from "./context";
import { Pausing } from "@lib/game/nlcore/elements/character/pause";
import { RawTexts } from "@player/elements/say/Sentence";

export interface ItemProps {
    className?: string;
    style?: React.CSSProperties;
}

export default function Item({ className, style }: ItemProps) {
    const ref = useRef<HTMLButtonElement>(null);
    const { register, unregister, getIndex } = useUIListContext();
    const [index, setIndex] = useState(-1);
    const {choose, evaluated, gameState} = useUIMenuContext();

    const choice: Choice & {
        words: Word<Pausing | string>[];
    } | null = index === -1 ? null : evaluated[index];

    useLayoutEffect(() => {
        if (!ref.current) return;
        const elementRef = ref as React.RefObject<HTMLButtonElement>;

        register(elementRef);
        setIndex(getIndex(elementRef));
        ref.current.dataset.index = index.toString();

        return () => unregister(elementRef);
    }, [register, unregister]);

    function handleClick() {
        if (index === -1) return;
        choose({
            ...evaluated[index],
            evaluated: Word.getText(evaluated[index].words),
        });
    }

    return (
        <>
            <button
                className={clsx(
                    className,
                )}
                style={style}
                onClick={handleClick}
            >
                {choice && (
                    <RawTexts
                        sentence={choice.prompt}
                        gameState={gameState}
                        useTypeEffect={false}
                        words={choice.words}
                    />
                )}
            </button>
        </>
    );
}
