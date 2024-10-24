import React, {useEffect, useMemo, useReducer, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import {Sentence as GameSentence} from "@core/elements/character/sentence";
import {Script} from "@core/elements/script";
import {Word, WordConfig} from "@core/elements/character/word";
import {toHex} from "@lib/util/data";
import clsx from "clsx";
import {Pause, Pausing} from "@core/elements/character/pause";

type SplitWord = {
    text: string;
    config: Partial<WordConfig>;
    tag: any;
    tag2?: any;
} | "\n" | Pausing;

export default function Sentence({
                                     sentence,
                                     gameState,
                                     useTypeEffect = true,
                                     onCompleted,
                                     finished,
                                     count,
                                     className,
                                 }: Readonly<{
    sentence: GameSentence;
    gameState: GameState;
    useTypeEffect?: boolean;
    onCompleted?: () => void;
    finished?: boolean;
    count?: number;
    className?: string;
}>) {
    const [isFinished, setIsFinished] = useState(false);
    const words = useMemo(() => sentence.evaluate(Script.getCtx({gameState})), []);
    const {game} = gameState;
    const [currentWords, setCurrentWords] = useState<Exclude<SplitWord, Pausing>[]>([]);
    const updaterRef = useRef(textUpdater(words));
    const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const [trigger, setTrigger] = useState(0);
    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const [seen, setSeen] = useState(new Set<SplitWord>());
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        if (!useTypeEffect) {
            skipToNext(true);
        }

        if (pauseTimerRef.current && finished && !isFinished) {
            clearTimeout(pauseTimerRef.current);
            pauseTimerRef.current = null;
            if (onCompleted) {
                gameState.logger.info("Say", "Completed", pauseTimerRef.current, finished, isFinished);
                onCompleted();
            }
            return;
        }

        if (isFinished || finished || isPaused || pauseTimerRef.current) {
            gameState.logger.debug("Sentence.tsx", "locked", isFinished, finished, isPaused);
            return;
        }

        const {done, value} = updaterRef.current.next();
        if (done) {
            setIsFinished(true);
            if (onCompleted) {
                gameState.logger.info("Say", "Completed", done, value);
                onCompleted();
            }
            return;
        }

        if (Pause.isPause(value)) {
            const pause = Pause.from(value);
            waitForPause(pause);
            return;
        } else {
            addWord(value);
            forceUpdate();

            intervalRef.current = setTimeout(() => {
                setTrigger((prev) => prev + 1);
            }, game.config.elements.say.textInterval);
        }
    }, [trigger, finished, isPaused]);

    useEffect(() => {
        if (!count || pauseTimerRef.current) return;

        if (isPaused) {
            setIsPaused(false);
            setTrigger((prev) => prev + 1);
            return;
        }

        skipToNext();
        setTrigger((prev) => prev + 1);
    }, [count]);

    function skipToNext(tilEnd = false) {
        if (intervalRef.current) {
            clearTimeout(intervalRef.current);
            intervalRef.current = null;
        }

        let exited = false;
        while (!exited) {
            const {done, value} = updaterRef.current.next();
            if (done) {
                setIsFinished(true);
                if (onCompleted) {
                    gameState.logger.info("Say", "Completed", done, value);
                    onCompleted();
                }
                exited = true;
            } else if (Pause.isPause(value)) {
                if (tilEnd) {
                    continue;
                }
                const pause = Pause.from(value);
                waitForPause(pause);
                exited = true;
            } else {
                addWord(value);
            }
        }
    }

    function addWord(value: Exclude<SplitWord, Pausing>) {
        setCurrentWords((prev) => {
            if (value !== "\n" && seen.has(value)) {
                return prev;
            }
            setSeen((prev) => new Set(prev).add(value));

            const last = prev[prev.length - 1];
            if (last && last !== "\n" && value !== "\n" && last.tag === value.tag) {
                return [...prev.slice(0, -1), {
                    text: last.text + value.text,
                    config: value.config,
                    tag: value.tag,
                    tag2: value.tag2,
                }];
            }
            return [...prev, value];
        });
    }

    function waitForPause(pause: Pause) {
        gameState.logger.info("Say", "Paused", pause);
        if (pause.config.duration) {
            pauseTimerRef.current = setTimeout(() => {
                pauseTimerRef.current = null;
                setTrigger((prev) => prev + 1);
            }, pause.config.duration);
        } else {
            setIsPaused(true);
        }
    }

    function* textUpdater(w: Word<string | Pausing>[]): Generator<SplitWord> {
        const words: Word<string | Pausing>[] = [...w];
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (Pause.isPause(word.text)) {
                yield Pause.from(word.text);
                continue;
            }

            for (let j = 0; j < word.text.length; j++) {
                const char = word.text[j];
                if (char === "\n") {
                    yield "\n";
                } else {
                    yield {
                        text: char,
                        config: word.config,
                        tag: i,
                        tag2: j,
                    } satisfies SplitWord;
                }
            }
        }

        return;
    }

    return (
        <div
            className={clsx(
                "whitespace-pre-wrap",
                game.config.elementStyles.say.textContainerClassName,
                {
                    "font-bold": sentence.config.bold,
                    "italic": sentence.config.italic,
                },
                className,
            )}
            style={{
                fontFamily: sentence.config.fontFamily || game.config.elementStyles.say.fontFamily,
                fontSize: sentence.config.fontSize || game.config.elementStyles.say.fontSize,
            }}
        >
            {currentWords.map((word, index) => {
                if (word === "\n") {
                    return <br key={index}/>;
                }
                return (
                    <span
                        key={index}
                        style={{
                            color: toHex(word.config.color || sentence.config.color || Word.defaultColor),
                            fontFamily: word.config.fontFamily,
                            fontSize: word.config.fontSize,
                            ...(game.config.app.debug ? {
                                border: "1px dashed red",
                            } : {}),
                        }}
                        className={clsx(
                            game.config.elementStyles.say.textSpanClassName,
                            "whitespace-pre inline-block",
                            {
                                "font-bold": word.config.bold,
                                "italic": word.config.italic,
                            },
                            word.config.className,
                        )}
                    >
                        {word.config.ruby ? (
                            <ruby className={"align-bottom inline-block"}>
                                <rt className={"block text-center"}>{word.config.ruby}</rt>
                                {word.text}
                            </ruby>
                        ) : (
                            word.text
                        )}
                    </span>
                );
            })}
        </div>
    );
}