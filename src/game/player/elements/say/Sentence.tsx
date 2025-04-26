import React, {useEffect, useMemo, useReducer, useRef, useState} from "react";
import {Word, WordConfig} from "@core/elements/character/word";
import {toHex} from "@lib/util/data";
import clsx from "clsx";
import {Pause, Pausing} from "@core/elements/character/pause";
import Inspect from "@player/lib/Inspect";
import {Script} from "@core/elements/script";
import { useSentenceContext } from "./context";
import { DialogElementProps } from "./type";
import { GameState } from "@lib/game/nlcore/common/game";
import { Sentence } from "@core/elements/character/sentence";

/**@internal */
type SplitWord = {
    text: string;
    config: Partial<WordConfig>;
    tag: any;
    tag2?: any;
    cps?: number;
} | "\n" | Pausing;

/**
 * Base component that handles the core text rendering logic
 * This component is not meant to be used directly
 */
interface BaseTextsProps {
    sentence: Sentence;
    gameState: GameState;
    useTypeEffect?: boolean;
    onCompleted?: () => void;
    finished?: boolean;
    count?: number;
    words?: Word<Pausing | string>[];
    className?: string;
    style?: React.CSSProperties;
}

function BaseTexts({
    sentence,
    gameState,
    useTypeEffect = true,
    onCompleted,
    finished,
    count,
    words: w,
    className,
    style,
    ...props
}: BaseTextsProps) {
    const [isFinished, setIsFinished] = useState(false);
    const {game} = gameState;
    const words = useMemo(() => w || sentence.evaluate(Script.getCtx({
        gameState,
    })), [w, sentence, gameState]);
    const [currentWords, setCurrentWords] = useState<Exclude<SplitWord, Pausing>[]>([]);
    const updaterRef = useRef(textUpdater(words));
    const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const [trigger, setTrigger] = useState(0);
    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const [seen, setSeen] = useState(new Set<SplitWord>());
    const [isPaused, setIsPaused] = useState(false);

    /**
     * Primary effect for handling text animation and typewriter effect.
     * Manages the sequential display of words, pauses, and completion states.
     * Dependencies:
     * - trigger: Controls the timing of word display
     * - finished: External completion signal
     * - isPaused: Internal pause state
     */
    useEffect(() => {
        if (!useTypeEffect) {
            skipToNext(true);
        }

        if (finished && !isFinished) {
            if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
            pauseTimerRef.current = null;
            skipToNext(true);
            if (onCompleted) {
                onCompleted();
            }
            return;
        }

        if (isFinished || finished || isPaused || pauseTimerRef.current) {
            return;
        }

        const {done, value} = updaterRef.current.next();
        if (done) {
            setIsFinished(true);
            if (onCompleted) {
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

            const interval = (typeof value === "object" && "cps" in value && value.cps !== undefined)
                ? Math.round(1000 / value.cps)
                : Math.round(1000 / game.config.cps);
            intervalRef.current = setTimeout(() => {
                setTrigger((prev) => prev + 1);
            }, interval);
        }
    }, [trigger, finished, isPaused]);

    /**
     * Secondary effect for handling count-based text progression.
     * Manages the advancement of text based on external count changes
     * and pause state transitions.
     * Dependencies:
     * - count: External counter for text progression
     */
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

    const displayedWords: Exclude<SplitWord, Pausing>[] = useTypeEffect ? currentWords : (() => {
        const result: Exclude<SplitWord, Pausing>[] = [];
        const updater = textUpdater(words);
        let exited = false;
        const processedWords = new Set<SplitWord>();
        
        while (!exited) {
            const {done, value} = updater.next();
            if (done) {
                exited = true;
            } else if (!Pause.isPause(value)) {
                if (value !== "\n" && processedWords.has(value)) {
                    continue;
                }
                processedWords.add(value);
                const last = result[result.length - 1];
                if (last && last !== "\n" && value !== "\n" && last.tag === value.tag) {
                    result[result.length - 1] = {
                        text: last.text + value.text,
                        config: value.config,
                        tag: value.tag,
                        tag2: value.tag2,
                    };
                } else {
                    result.push(value);
                }
            }
        }
        return result;
    })();

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
                        cps: word.config.cps,
                    } satisfies SplitWord;
                }
            }
        }

        return;
    }

    return (
        <div
            {...props}
            className={clsx(
                "whitespace-pre-wrap",
                {
                    "font-bold": sentence.config.bold,
                    "italic": sentence.config.italic,
                },
                className,
            )}
            style={{
                ...style,
            }}
        >
            {displayedWords.map((word, index) => {
                if (word === "\n") {
                    return <br key={index}/>;
                }
                return (
                    <Inspect.Span
                        tag={`say.word.${index}`}
                        key={index}
                        style={{
                            color: toHex(word.config.color || sentence.config.color || game.config.defaultTextColor),
                            fontFamily: word.config.fontFamily,
                            fontSize: word.config.fontSize,
                            ...(game.config.app.debug ? {
                                outline: "1px dashed red",
                            } : {}),
                        }}
                        className={clsx(
                            "inline-block break-all",
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
                    </Inspect.Span>
                );
            })}
        </div>
    );
}

/**
 * Props-based wrapper component
 * Provides a clean interface for direct prop usage
 */
export interface TextsProps extends DialogElementProps {
    sentence: Sentence;
    gameState: GameState;
    useTypeEffect?: boolean;
    onCompleted?: () => void;
    finished?: boolean;
    count?: number;
    words?: Word<Pausing | string>[];
}

export function RawTexts(props: TextsProps) {
    return <BaseTexts {...props} />;
}

/**
 * Context-based wrapper component
 * Provides integration with the sentence context
 */
export function Texts(props: DialogElementProps) {
    const context = useSentenceContext();
    return (
        <BaseTexts
            {...props}
            sentence={context.sentence}
            gameState={context.gameState}
            useTypeEffect={context.useTypeEffect}
            onCompleted={context.onCompleted}
            finished={context.finished}
            count={context.count}
            words={context.words}
        />
    );
}

export default Texts;