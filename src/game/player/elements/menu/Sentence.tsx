import React from "react";
import {Sentence} from "@core/elements/text";
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
            {sentence.text.map((word, i) => (
                <span key={i} style={{color: toHex(word.config.color)}} className={className}>{word.text}</span>
            ))}
        </>
    );
}


