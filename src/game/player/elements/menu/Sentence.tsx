import React, {useMemo} from "react";
import {toHex} from "@lib/util/data";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {Script} from "@core/elements/script";
import {GameState} from "@player/gameState";
import {Lines} from "@player/elements/say/TypingEffect";

export default function ColoredSentence(
    {
        sentence,
        className,
        gameState,
    }: Readonly<{
        sentence: Sentence;
        className?: string;
        gameState: GameState;
    }>) {

    const words = useMemo(() => sentence.evaluate(Script.getCtx({
        gameState,
    })), []);

    return (
        <>
            {words.map((word, i) => {
                const color = word.config.color || sentence.config.color || Word.defaultColor;
                return (
                    <span key={i} style={{color: toHex(color)}} className={className}><Lines
                        text={word.text}/>
                    </span>
                );
            })}
        </>
    );
}


