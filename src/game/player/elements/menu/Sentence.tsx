import React from "react";
import {Sentence, Word} from "@core/elements/text";
import {toHex} from "@lib/util/data";

export default function ColoredSentence({
                                            sentence,
                                            className,
                                        }: Readonly<{
    sentence: Sentence;
    className?: string;
}>) {
    return (
        <>
            {sentence.text.map((word, i) => {
                const color = word.config.color || sentence.config.color || Word.defaultColor;
                return <span key={i} style={{color: toHex(color)}} className={className}>{word.text}</span>;
            })}
        </>
    );
}


