import { Pause, Pausing } from "@core/elements/character/pause";
import { Sentence } from "@core/elements/character/sentence";
import { Word, WordConfig } from "@core/elements/character/word";
import { Script } from "@core/elements/script";
import { Game, GameState } from "@lib/game/nlcore/common/game";
import { Color, LiveGameEventToken } from "@lib/game/nlcore/types";
import { Awaitable, onlyIf, SkipController, sleep, toHex } from "@lib/util/data";
import Inspect from "@player/lib/Inspect";
import clsx from "clsx";
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePreference } from "../../libElements";
import { useGame } from "../../provider/game-state";
import { Timeline } from "../../Tasks";
import { useDialogContext } from "./context";
import { DialogElementProps } from "./type";
import { DialogState } from "./UIDialog";
import { useFlush } from "../../lib/flush";

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
interface BaseTextsProps_ {
    sentence: Sentence;
    gameState: GameState;
    useTypeEffect?: boolean;
    onCompleted?: () => void;
    finished?: boolean;
    count?: number;
    words?: Word<Pausing | string>[];
    className?: string;
    style?: React.CSSProperties;
    defaultColor?: Color;
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

type RollingTask = {
    getToken: () => Awaitable;
    interact: () => void;
    flush: () => void;
    timeline: Timeline;
    onComplete: (listener: VoidFunction) => LiveGameEventToken;
};

type PureWord = Exclude<SplitWord, Pausing>;
type InteractionHandler = (preventDefault: () => void) => void;
type BaseTextsProps = {
    /**
     * The default color of the text
     */
    defaultColor?: Color;
    className?: string;
    style?: React.CSSProperties;
    dialog?: DialogState;
} & React.HTMLAttributes<HTMLDivElement>;


function BaseText(
    { defaultColor, className, style, dialog, ...props }: BaseTextsProps
) {
    const game = useGame();
    const gameState = game.getLiveGame().getGameState()!;
    const taskRef = useRef<RollingTask | null>(null);
    const [gameSpeed] = usePreference(Game.Preferences.gameSpeed);
    const [autoForward] = usePreference(Game.Preferences.autoForward);
    const [displaying, setDisplaying] = useState<PureWord[]>([]);
    const [flush ,flushDep] = useFlush();

    if (!dialog) {
        throw new Error("Dialog state is required");
    }

    /* @debug */ console.log(dialog.config.evaluatedWords);

    /**
     * Initialize the task
     */
    useEffect(() => {
        if (!dialog.config.action.sentence || taskRef.current) {
            return;
        }

        if (!dialog.config.useTypeEffect) {
            setDisplaying(getGeneratedWords(dialog.config.evaluatedWords));
            dialog.dispatchComplete();
            return;
        }

        taskRef.current = roll();
        flush();
    }, []);

    /**
     * Listen to:
     * - the user interaction (e.g. click, space)
     * - the forceSkip event from the dialog state
     */
    useEffect(() => {
        if (!taskRef.current) return;

        return dialog.events.depends([
            dialog.events.on(DialogState.Events.requestComplete, () => {
                gameState.logger.debug("Sentence.tsx", "requestComplete");
                taskRef.current?.interact();
            }),
            dialog.events.on(DialogState.Events.forceSkip, () => {
                gameState.logger.debug("Sentence.tsx", "forceSkip");
                taskRef.current?.getToken().abort();
                setDisplaying(getGeneratedWords(dialog.config.evaluatedWords));
                dialog.dispatchComplete();
            }),
        ]).cancel;
    }, [flushDep]);

    /**
     * Listen to:
     * - autoForward, gameSpeed changes
     */
    useEffect(() => {
        if (!taskRef.current) return;

        // Make sure to clean up the task before the effect is re-run
        const cleanup = () => {
            taskRef.current?.flush();
        };

        cleanup();
        return cleanup;
    }, [gameSpeed, autoForward, flushDep]);

    function roll(): RollingTask {
        const mainTask = new Awaitable<void>();
        const timeline = new Timeline(mainTask).setGuard(gameState.guard);
        const seen = new Set<SplitWord>();
        const interactionHandlers: Set<InteractionHandler> = new Set();
        const completeListeners: Set<VoidFunction> = new Set();
        const updater = textUpdater(dialog!.config.evaluatedWords);
        let renderTask: Awaitable | null = null;
        const sideEffects: VoidFunction[] = [];
        const clearSideEffects = () => {
            sideEffects.forEach((effect) => effect());
            sideEffects.length = 0;
        };

        const onceInteraction = (listener: InteractionHandler): LiveGameEventToken => {
            const newListener = (preventDefault: () => void) => {
                listener(preventDefault);
                interactionHandlers.delete(newListener);
            };
            interactionHandlers.add(newListener);
            return {
                cancel: () => {
                    interactionHandlers.delete(newListener);
                },
            };
        };
        const updateDisplaying = (value: Exclude<SplitWord, Pausing>) => {
            setDisplaying((prev) => {
                const last = prev[prev.length - 1];
                if (last && last !== "\n" && value !== "\n" && last.tag === value.tag) {
                    return [...prev.slice(0, -1), {
                        ...value,
                        text: last.text + value.text,
                        config: value.config,
                    }];
                }
                return [...prev, value];
            });
        };

        const skipToEnd = () => {
            gameState.logger.debug("Sentence.tsx", "skipToEnd");

            // Skip to next pause or end
            let exited = false;
            while (!exited) {
                const { done, value } = updater.next();
                if (done) {
                    exited = true;
                    break;
                }
                if (Pause.isPause(value)) {
                    // Found a pause, stop here
                    exited = true;
                    break;
                }
                // Skip non-pause words
                if (value === "\n") {
                    setDisplaying((prev) => [...prev, value]);
                } else if (typeof value === "object" && "text" in value && !seen.has(value)) {
                    seen.add(value);
                    updateDisplaying(value);
                }
            }

            if (renderTask) {
                renderTask.abort();
            }
        };

        gameState.schedule(async (handle) => {
            let exited = false, completed = false;
            while (!exited) {
                // If the task is completed, exit the loop and mark the task as completed
                const { done, value } = updater.next();
                if (done) {
                    exited = completed = true;
                    break;
                }

                // When the gamespeed or autoForward changes, the awaitable will be cancelled
                // Once the awaitable is cancelled, retry the task to apply the changes
                const awaitable = new Awaitable<void>();
                gameState.timelines.attachTimeline(awaitable);
                awaitable.registerSkipController(new SkipController(() => {
                    clearSideEffects();
                    exited = true;
                    handle.retry();
                }));
                awaitable.onSettled(() => {
                    clearSideEffects();
                });

                renderTask = awaitable;

                // If the value is a pause, wait for it
                if (Pause.isPause(value)) {
                    const pause = Pause.from(value);
                    if (pause.config.duration) {
                        // Side Effect Cleanup: state "exited"
                        const duration = pause.config.duration / gameSpeed;
                        await sleep(duration);
                    } else {
                        // Side Effect Cleanup: awaitable skip controller
                        const match = Awaitable.race<void>([
                            Awaitable.create((i) => {
                                const token = onceInteraction((preventDefault) => {
                                    preventDefault();
                                    i.resolve();
                                });
                                sideEffects.push(() => token.cancel());
                            }),
                            ...(autoForward ? [Awaitable.delay(game.config.autoForwardDefaultPause / gameSpeed)] : []),
                        ]);
                        gameState.timelines.attachTimeline(match);

                        await Awaitable.wait(match);
                    }
                } else {
                    // If the value is a word, add it to the displaying words
                    if (value !== "\n" && seen.has(value)) {
                        continue;
                    }
                    seen.add(value);

                    // Update the last character to the last word
                    updateDisplaying(value);

                    // Wait for a delay
                    const baseCps = (typeof value === "object" && "cps" in value && value.cps !== undefined)
                        ? value.cps
                        : game.config.cps;
                    const delay = baseCps * gameSpeed;
                    await Awaitable.delay(delay);
                }
            }

            // If the task is completed, emit the complete event
            if (completed) {
                completeListeners.forEach((listener) => listener());
                mainTask.resolve();
            }
        }, 0);

        const onComplete = (listener: VoidFunction) => {
            completeListeners.add(listener);
            return {
                cancel: () => {
                    completeListeners.delete(listener);
                },
            };
        };
        const interact = () => {
            let prevented = false;
            interactionHandlers.forEach((listener) => listener(() => prevented = true));
            if (prevented) {
                return;
            }

            // If not prevented, try to skip to next pause or end of sentence
            skipToEnd();
        };
        const flush = () => {
            if (renderTask) {
                renderTask.abort();
            }
        };

        return {
            getToken: () => mainTask,
            interact,
            flush,
            timeline,
            onComplete,
        };
    }

    function getGeneratedWords(words: Word<Pausing | string>[]): PureWord[] {
        const generator = textUpdater(words);
        const result: PureWord[] = [];
        for (const value of generator) {
            if (Pause.isPause(value)) {
                continue;
            }
            result.push(value);
        }
        return result;
    }

    const sentence = dialog.config.action.sentence;
    if (!sentence) {
        return null;
    }

    const calculatedSentence: React.CSSProperties = {
        fontWeight: sentence.config.bold ? game.config.fontWeightBold : game.config.fontWeight,
        fontSize: sentence.config.fontSize ?? game.config.fontSize,
        color: toHex(sentence.config.color ?? game.config.defaultTextColor),
        fontFamily: sentence.config.fontFamily ?? game.config.fontFamily,
        fontStyle: sentence.config.italic ? "italic" : undefined,
    };

    const calculateStyle = (word: Exclude<SplitWord, Pausing | "\n">): React.CSSProperties => ({
        fontWeight: word.config.bold
            ? game.config.fontWeightBold
            : sentence.config.bold
                ? game.config.fontWeightBold
                : game.config.fontWeight,
        fontSize: word.config.fontSize ?? sentence.config.fontSize ?? game.config.fontSize,
        color: toHex(word.config.color ?? sentence.config.color ?? defaultColor ?? game.config.defaultTextColor),
        fontFamily: word.config.fontFamily ?? sentence.config.fontFamily ?? game.config.fontFamily,
        fontStyle: word.config.italic ?? sentence.config.italic ? "italic" : undefined,
    });

    const getElement = (word: PureWord, index: number) => {
        if (word === "\n") return (<br key={index} />);
        return (
            <Inspect.Span
                tag={`say.word.${index}`}
                key={index}
                style={{
                    ...calculateStyle(word),
                    ...onlyIf<React.CSSProperties>(game.config.app.debug, {
                        outline: "1px dashed red",
                    }),
                }}
                className={clsx(
                    "inline-block break-all",
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
    };

    return (
        <div
            {...props}
            className={clsx(
                "whitespace-pre-wrap",
                className,
            )}
            style={{
                ...style,
                ...calculatedSentence,
            }}
        >
            {displaying.map(getElement)}
        </div>
    );
}

/**
 * @deprecated
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function BaseTexts_({
    sentence,
    gameState,
    useTypeEffect = true,
    onCompleted,
    finished,
    count,
    words: w,
    className,
    style,
    defaultColor,
    ...props
}: BaseTextsProps_) {
    const [isFinished, setIsFinished] = useState(false);
    const { game } = gameState;
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
    const [gameSpeed] = usePreference(Game.Preferences.gameSpeed);
    const [autoForward] = usePreference(Game.Preferences.autoForward);
    const lastWordRef = useRef<Exclude<SplitWord, Pausing> | null>(null);

    /**
     * Calculate and set the interval for the next character based on the current word and game speed
     */
    const setNextInterval = (word: Exclude<SplitWord, Pausing>) => {
        const baseCps = (typeof word === "object" && "cps" in word && word.cps !== undefined)
            ? word.cps
            : game.config.cps;
        const adjustedCps = baseCps * gameSpeed;
        const interval = Math.round(1000 / adjustedCps);

        if (intervalRef.current) {
            clearTimeout(intervalRef.current);
        }

        intervalRef.current = setTimeout(() => {
            setTrigger((prev) => prev + 1);
        }, interval);
    };

    /**
     * Effect to handle gameSpeed changes and update interval immediately
     */
    useEffect(() => {
        if (!lastWordRef.current || isFinished || finished || isPaused || pauseTimerRef.current) {
            return;
        }

        setNextInterval(lastWordRef.current);
    }, [gameSpeed]);

    /**
     * Effect to handle autoForward changes
     */
    useEffect(() => {
        if (autoForward && isPaused && pauseTimerRef.current) {
            clearTimeout(pauseTimerRef.current);
            pauseTimerRef.current = null;
            setTrigger((prev) => prev + 1);
        }
    }, [autoForward]);

    /**
     * Primary effect for handling text animation and typewriter effect.
     * Manages the sequential display of words, pauses, and completion states.
     * Dependencies:
     * - trigger: Controls the timing of word display
     * - finished: External completion signal
     * - isPaused: Internal pause state
     * - gameSpeed: Controls the speed of text printing
     * - autoForward: Controls the autoForward state
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

        const { done, value } = updaterRef.current.next();
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
            lastWordRef.current = value;
            setNextInterval(value);
        }
    }, [trigger, finished, isPaused, gameSpeed, autoForward]);

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

    useEffect(() => {
        if (!style) return;

        const violated = ["fontSize", "fontWeight", "color", "fontFamily"].filter((key) => {
            const value = style[key as keyof React.CSSProperties];
            return value !== undefined && value !== null && value !== "";
        });
        gameState.logger.warn("Dialog",
            `Style properties ${violated.join(", ")} are not supported. `,
            "(style:", style, ")",
            "Please use the game config instead."
        );
    }, [style]);

    const displayedWords: Exclude<SplitWord, Pausing>[] = useTypeEffect ? currentWords : (() => {
        const result: Exclude<SplitWord, Pausing>[] = [];
        const updater = textUpdater(words);
        let exited = false;
        const processedWords = new Set<SplitWord>();

        while (!exited) {
            const { done, value } = updater.next();
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
            const { done, value } = updaterRef.current.next();
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
        gameState.logger.info("Say", "Paused", pause, "autoForward", autoForward);
        if (pause.config.duration) {
            const adjustedDuration = pause.config.duration / gameSpeed;
            pauseTimerRef.current = setTimeout(() => {
                pauseTimerRef.current = null;
                setTrigger((prev) => prev + 1);
            }, adjustedDuration);
        } else if (autoForward) {
            const adjustedDuration = game.config.autoForwardDefaultPause / gameSpeed;
            pauseTimerRef.current = setTimeout(() => {
                pauseTimerRef.current = null;
                setTrigger((prev) => prev + 1);
            }, adjustedDuration);
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

    const calculatedSentence: React.CSSProperties = {
        fontWeight: sentence.config.bold ? game.config.fontWeightBold : game.config.fontWeight,
        fontSize: sentence.config.fontSize ?? game.config.fontSize,
        color: toHex(sentence.config.color ?? game.config.defaultTextColor),
        fontFamily: sentence.config.fontFamily ?? game.config.fontFamily,
        fontStyle: sentence.config.italic ? "italic" : undefined,
    };

    const calculateStyle = (word: Exclude<SplitWord, Pausing | "\n">): React.CSSProperties => ({
        fontWeight: word.config.bold
            ? game.config.fontWeightBold
            : sentence.config.bold
                ? game.config.fontWeightBold
                : game.config.fontWeight,
        fontSize: word.config.fontSize ?? sentence.config.fontSize ?? game.config.fontSize,
        color: toHex(word.config.color ?? sentence.config.color ?? defaultColor ?? game.config.defaultTextColor),
        fontFamily: word.config.fontFamily ?? sentence.config.fontFamily ?? game.config.fontFamily,
        fontStyle: word.config.italic ?? sentence.config.italic ? "italic" : undefined,
    });

    return (
        <div
            {...props}
            className={clsx(
                "whitespace-pre-wrap",
                className,
            )}
            style={{
                ...style,
                ...calculatedSentence,
            }}
        >
            {displayedWords.map((word, index) => {
                if (word === "\n") return (<br key={index} />);
                return (
                    <Inspect.Span
                        tag={`say.word.${index}`}
                        key={index}
                        style={{
                            ...calculateStyle(word),
                            ...onlyIf<React.CSSProperties>(game.config.app.debug, {
                                outline: "1px dashed red",
                            }),
                        }}
                        className={clsx(
                            "inline-block break-all",
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

export function RawTexts(props: BaseTextsProps) {
    return <BaseText {...props} />;
}

/**
 * Context-based wrapper component
 * Provides integration with the sentence context
 */
export function Texts(props: BaseTextsProps) {
    const context = useDialogContext();
    return (
        <BaseText {...props} dialog={context} />
    );
}

export default Texts;