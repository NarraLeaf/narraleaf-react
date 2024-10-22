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
    const completeSentence = useMemo(() => split(
        words,
        words.reduce((acc, word) => {
            return acc + word.text.length;
        }, 0) - 1
    ), [words]);

    useEffect(() => {
        const length = getLength(completeSentence);

        if (!useTypeEffect || isFinished || finished || currentIndex >= length) {
            setCurrentIndex(length);
            setIsFinished(true);

            if (onCompleted) {
                onCompleted();
            }
            return;
        }

        if (completeSentence[completeSentence.length] === "\n") {
            setCurrentIndex((prev) => prev + 1);
        } else {
            const timeoutId = setTimeout(() => {
                setCurrentIndex((prev) => prev + 1);
            }, game.config.elements.say.textInterval);
            return () => clearTimeout(timeoutId);
        }
    }, [currentIndex, finished]);

    function split(words: Word<string>[], index: number): SplitWord[] {
        const results: SplitWord[] = [];
        const tasks: Word<string>[] = [...words];
        let i = index + 1;
        const addResult = (...res: SplitWord[]) => {
            res.forEach(result => {
                if (result === "\n") {
                    results.push("\n");
                } else if (result.text.length) {
                    results.push(result);
                }
            });
        };

        w: while (i) {
            const word = tasks.shift();
            if (!word) break;

            let result = {text: "", config: word.config};

            for (const char of word.text) {
                if (!i) {
                    results.push(result);
                    break w;
                }
                if (char === "\n") {
                    addResult(result, "\n");
                    i -= 1;
                    result = {text: "", config: word.config};
                } else {
                    result.text += char;
                    i -= 1;
                }
            }

            addResult(result);
        }

        return results;
    }

    function getLength(words: SplitWord[]): number {
        return words.reduce((acc, word) => {
            return acc + (word === "\n" ? 1 : word.text.length);
        }, 0);
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

