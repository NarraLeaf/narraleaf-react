import React, {useEffect, useMemo, useState} from "react";
import {GameState} from "@player/gameState";
import {Sentence as GameSentence} from "@core/elements/character/sentence";
import {Script} from "@core/elements/script";
import {Word, WordConfig} from "@core/elements/character/word";
import {toHex} from "@lib/util/data";
import clsx from "clsx";

type SplitWord = {
    text: string;
    config: Partial<WordConfig>;
} | "\n";

export default function Sentence(
    {
        sentence,
        gameState,
        useTypeEffect = true,
        onCompleted,
        finished,
    }: Readonly<{
        sentence: GameSentence;
        gameState: GameState;
        useTypeEffect?: boolean;
        onCompleted?: () => void;
        finished?: boolean;
    }>) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const words = useMemo(() => sentence.evaluate(Script.getCtx({
        gameState,
    })), []);
    const {game} = gameState;

    useEffect(() => {
        const totalLength = words.reduce((acc, word) => {
            return acc + word.text.length;
        }, 0);
        const completeSentence = split(words, totalLength);

        if (!useTypeEffect || finished || currentIndex >= completeSentence.length) {
            setCurrentIndex(completeSentence.length);
            setIsFinished(true);
        }

        if (isFinished) {
            if (onCompleted) {
                onCompleted();
            }
            return;
        }

        if (completeSentence[currentIndex] === "\n") {
            setCurrentIndex((prev) => prev + 1);
        } else {
            const timeoutId = setTimeout(() => {
                setCurrentIndex((prev) => prev + 1);
            }, game.config.elements.say.textInterval);
            return () => clearTimeout(timeoutId);
        }
    }, [currentIndex, finished]);

    function split(words: Word<string>[], index: number): SplitWord[] {
        const result: SplitWord[] = [];
        const tasks: Word<string>[] = [...words];
        let i = 0;

        while (i < index) {
            const task = tasks.shift();
            if (!task) break;
            const text: string = task.text;

            for (const char of text) {
                if (i >= index) break;
                if (char === "\n") {
                    result.push("\n");
                } else {
                    result.push({text: char, config: task.config});
                }
                i++;
            }
        }

        return result;
    }

    const currentWords = split(words, currentIndex);

    return (<>
        {currentWords.map((word, index) => {
            if (word === "\n") {
                return <br key={index}/>;
            }
            return <span
                key={index}
                style={{
                    color: toHex(word.config.color || sentence.config.color || Word.defaultColor),
                }}
                className={clsx(game.config.elementStyles.say.textSpan, "whitespace-pre")}
            >{word.text}</span>;
        })}
    </>);

}

