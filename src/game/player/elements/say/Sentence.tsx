import { Pause, Pausing } from "@core/elements/character/pause";
import { TextEvent } from "@core/elements/character/textEvent";
import { Sentence, type StaticWord } from "@core/elements/character/sentence";
import { Word, WordConfig } from "@core/elements/character/word";
import { Game, GameState } from "@lib/game/nlcore/common/game";
import { Color, LiveGameEventToken } from "@lib/game/nlcore/types";
import { Awaitable, onlyIf, SkipController, sleep, toHex } from "@lib/util/data";
import Inspect from "@player/lib/Inspect";
import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";
import { useFlush } from "../../lib/flush";
import { useGame, useOptionalGame } from "../../provider/game-state";
import { Timeline } from "../../Tasks";
import { useDialogContext } from "./context";
import { DialogState } from "./UIDialog";
import { useNvlDialogState } from "../nvl/useNvlDialogState";
import type { NvlDialogEntry } from "@player/gameState";
import { fireInstantRevealEvents, fireTextEventOnce } from "./textEventEffect";
import {
    isVerticalWritingMode,
    renderWordText,
    verticalContainerStyle,
    wordBreakStyleFor,
    type TateChuYoko,
    type TextGlyphOrientation,
    type TextWritingMode,
} from "@player/lib/verticalText";

/**@internal */
type SplitWord = {
    text: string;
    config: Partial<WordConfig>;
    tag: any;
    tag2?: any;
    cps?: number;
} | "\n" | Pausing | TextEvent;

function* textUpdater(w: Word<string | Pausing | TextEvent>[]): Generator<SplitWord> {
    const words: Word<string | Pausing | TextEvent>[] = [...w];
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (Pause.isPause(word.text)) {
            yield Pause.from(word.text);
            continue;
        }
        if (TextEvent.isTextEvent(word.text)) {
            yield word.text;
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
    update: () => void;
    forceSkip: () => void;
    timeline: Timeline;
    onComplete: (listener: VoidFunction) => LiveGameEventToken;
};

type PureWord = Exclude<SplitWord, Pausing | TextEvent>;
type InteractionHandler = (preventDefault: () => void) => void;
export type TextAppearanceProps = {
    /**
     * The default color of the text
     */
    defaultColor?: Color;
    fontSize?: React.CSSProperties["fontSize"];
    fontWeight?: React.CSSProperties["fontWeight"];
    fontWeightBold?: React.CSSProperties["fontWeight"];
    fontFamily?: React.CSSProperties["fontFamily"];
    /**
     * Block flow of the text box. `vertical-rl` is the classic Japanese novel setting: columns
     * read top to bottom and advance leftwards.
     * @default "horizontal-tb"
     */
    writingMode?: TextWritingMode;
    /**
     * How glyphs sit inside a vertical column. `mixed` keeps CJK upright and lays Latin on its
     * side; ignored while the box is horizontal.
     * @default "mixed"
     */
    textOrientation?: TextGlyphOrientation;
    /**
     * Tate-chu-yoko (縦中横): sets a short Latin or digit run upright across the column instead of
     * on its side. `true` combines runs of up to two characters; a number sets the limit.
     * Ignored while the box is horizontal.
     * @default true
     */
    tateChuYoko?: TateChuYoko;
};

export type BaseTextsProps = TextAppearanceProps & {
    className?: string;
    style?: React.CSSProperties;
    dialog?: DialogState;
} & React.HTMLAttributes<HTMLDivElement>;

export type TextsPreviewInput = StaticWord<string | Pausing> | StaticWord<string | Pausing>[];

export type TextsPreviewLoop = boolean | {
    /**
     * Whether the preview restarts after the current type effect completes.
     * @default true
     */
    enabled?: boolean;
    /**
     * Delay before the next preview cycle starts, in milliseconds.
     * @default 1000
     */
    delay?: number;
};

export interface TextsPreviewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
    /**
     * Static text or words to preview.
     */
    text?: TextsPreviewInput;
    /**
     * Sentence to preview. Dynamic words are not evaluated; pass `words` when
     * previewing already-evaluated runtime content.
     */
    sentence?: Sentence;
    /**
     * Already-evaluated words, useful when previewing dynamic sentence content.
     */
    words?: Word<Pausing | string | TextEvent>[];
    /**
     * Whether the preview should use the rolling type effect.
     * @default true
     */
    useTypeEffect?: boolean;
    /**
     * Loop behavior for settings screens and other static previews.
     * @default true
     */
    loop?: TextsPreviewLoop;
    /**
     * Delay before replay when `loop` is `true`, in milliseconds.
     * Ignored when `loop` is an object with `delay`.
     * @default 1000
     */
    restartDelay?: number;
    /**
     * Characters per second used by the preview.
     * @default current game's `cps` preference, or Game.DefaultPreference.cps outside GameProvider
     */
    cps?: number;
    /**
     * Speed multiplier used by the preview.
     * @default current game's `gameSpeed` preference, or Game.DefaultPreference.gameSpeed outside GameProvider
     */
    gameSpeed?: number;
    /**
     * Duration for a pause without an explicit duration, in milliseconds.
     * @default current game's `autoForwardDefaultPause` config, or Game.DefaultConfig.autoForwardDefaultPause outside GameProvider
     */
    pauseDuration?: number;
    /**
     * Fallback color when neither the word nor the sentence defines one.
     */
    defaultColor?: Color;
    fontSize?: React.CSSProperties["fontSize"];
    fontWeight?: React.CSSProperties["fontWeight"];
    fontWeightBold?: React.CSSProperties["fontWeight"];
    fontFamily?: React.CSSProperties["fontFamily"];
    writingMode?: TextWritingMode;
    textOrientation?: TextGlyphOrientation;
    tateChuYoko?: TateChuYoko;
    onCompleted?: () => void;
}

type ResolvedTextsPreviewLoop = {
    enabled: boolean;
    delay: number;
};

function getGeneratedWords(words: Word<Pausing | string | TextEvent>[]): PureWord[] {
    const generator = textUpdater(words);
    const result: PureWord[] = [];
    for (const value of generator) {
        if (Pause.isPause(value) || TextEvent.isTextEvent(value)) {
            continue;
        }
        result.push(value);
    }
    return result;
}

function updateDisplayingWord(
    setDisplaying: React.Dispatch<React.SetStateAction<PureWord[]>>,
    value: Exclude<SplitWord, Pausing | TextEvent>
) {
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
}

function getPreviewWords(
    text: TextsPreviewInput | undefined,
    sentence: Sentence | undefined,
    words: Word<Pausing | string | TextEvent>[] | undefined
): Word<Pausing | string | TextEvent>[] {
    if (words) {
        return words;
    }
    if (text !== undefined) {
        return Sentence.formatStaticWord(text);
    }
    if (!sentence) {
        return [];
    }
    return sentence.text.flatMap((word) => {
        if (typeof word.text === "function") {
            return [];
        }
        return new Word<string | Pausing | TextEvent>(word.text, word.config);
    });
}

function resolveTextsPreviewLoop(
    loop: TextsPreviewLoop | undefined,
    restartDelay: number | undefined,
    defaultDelay: number
): ResolvedTextsPreviewLoop {
    const delay = Math.max(0, restartDelay ?? defaultDelay);
    if (typeof loop === "object") {
        return {
            enabled: loop.enabled ?? true,
            delay: Math.max(0, loop.delay ?? delay),
        };
    }
    return {
        enabled: loop ?? true,
        delay,
    };
}

function getPreviewDelay(cps: number, gameSpeed: number) {
    const safeCps = Math.max(0.01, cps);
    const safeGameSpeed = Math.max(0.01, gameSpeed);
    return 1000 / (safeCps * safeGameSpeed);
}

function toOptionalColor(color: Color | undefined): React.CSSProperties["color"] {
    return color === undefined ? undefined : toHex(color);
}

function BaseText(
    {
        defaultColor,
        className,
        style,
        dialog,
        fontSize,
        fontWeight,
        fontWeightBold,
        fontFamily,
        writingMode,
        textOrientation,
        tateChuYoko,
        ...props
    }: BaseTextsProps
) {
    const game = useGame();
    const gameState = game.getLiveGame().getGameState()!;
    const taskRef = useRef<RollingTask | null>(null);
    const [displaying, setDisplaying] = useState<PureWord[]>(() => {
        if (dialog && !dialog.config.useTypeEffect) {
            return getGeneratedWords(dialog.config.evaluatedWords);
        }
        return [];
    });
    const [flush, flushDep] = useFlush();

    if (!dialog) {
        throw new Error("Dialog state is required");
    }

    /**
     * Initialize the task
     */
    useEffect(() => {
        if (!dialog.config.action.sentence || taskRef.current) {
            return;
        }
        gameState.logger.info("Initializing the sentence", dialog, taskRef.current);

        return gameState.schedule(({ onCleanup }) => {
            if (!dialog.config.useTypeEffect) {
                // Instant reveal: every position is crossed at once, so all text-event effects land
                // immediately (the same "final state" the skip path produces). The guard is the
                // line's persistent set when present (NVL), so a re-mount of an already-revealed line
                // replays neither the sound effects nor the stale expression.
                fireInstantRevealEvents(
                    dialog.config.evaluatedWords,
                    dialog.config.firedTextEvents ?? new Set<TextEvent>(),
                    gameState
                );
                dialog.dispatchComplete();
                return;
            }
            setDisplaying([]);
    
            taskRef.current = roll();
            flush();
    
            taskRef.current.onComplete(() => {
                dialog.dispatchComplete();
            });

            onCleanup(() => {
                taskRef.current?.timeline?.abort();
            });
        }, 0);
    }, []);

    /**
     * Listen to:
     * - the user interaction (e.g. click, space)
     * - the forceSkip event from the dialog state
     */
    useEffect(() => {
        return dialog.events.depends([
            dialog.events.on(DialogState.Events.requestComplete, () => {
                taskRef.current?.interact();
            }),
            dialog.events.on(DialogState.Events.forceSkip, () => {
                if (!dialog.isEnded()) {
                    taskRef.current?.forceSkip();
                }
            }),
        ]).cancel;
    }, [dialog, flushDep]);

    /**
     * Listen to:
     * - autoForward, gameSpeed changes
     */
    useEffect(() => {
        return game.preference.events.depends([
            game.preference.onPreferenceChange(Game.Preferences.gameSpeed, () => {
                taskRef.current?.update();
            }),
            game.preference.onPreferenceChange(Game.Preferences.autoForward, () => {
                taskRef.current?.update();
            }),
            game.preference.onPreferenceChange(Game.Preferences.cps, () => {
                taskRef.current?.update();
            })
        ]).cancel;
    }, []);

    function roll(): RollingTask {
        const mainTask = new Awaitable<void>();
        const timeline = new Timeline(mainTask).setGuard(gameState.guard);
        const seen = new Set<SplitWord>();
        // Idempotency guard for text-event tokens (contract 5): a token fires at most once, whether
        // it is reached by the roll or crossed by a skip. For NVL this is the line's persistent set,
        // so a re-mount that re-enters the roll (or lands on the instant branch) never re-fires; ADV
        // falls back to a per-run set.
        const firedEvents = dialog!.config.firedTextEvents ?? new Set<TextEvent>();
        const interactionHandlers: Set<InteractionHandler> = new Set();
        const completeListeners: Set<VoidFunction> = new Set();
        const updater = textUpdater(dialog!.config.evaluatedWords);
        let renderTask: Awaitable | null = null;
        const sideEffects: VoidFunction[] = [];
        const queue: SplitWord[] = [];
        const clearSideEffects = () => {
            sideEffects.forEach((effect) => effect());
            sideEffects.length = 0;
        };
        const iterate = (): { done: boolean | undefined, value: SplitWord } => {
            if (queue.length !== 0) {
                return {
                    done: false,
                    value: queue.shift()!,
                };
            }
            const { done, value } = updater.next();
            return {
                done,
                value,
            };
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
        const updateDisplaying = (value: Exclude<SplitWord, Pausing | TextEvent>) => {
            updateDisplayingWord(setDisplaying, value);
        };

        const trySkip = (untilEnd: boolean = false) => {
            // Skip to next pause or end
            let exited = false;
            while (!exited) {
                const { done, value } = iterate();
                if (done) {
                    exited = true;
                    break;
                }
                if (Pause.isPause(value)) {
                    // Found a pause, stop here
                    if (untilEnd) {
                        continue;
                    }
                    exited = true;
                    queue.push(value);
                    break;
                } else if (TextEvent.isTextEvent(value)) {
                    // A crossed token fires its effect (contract 3: skip lands the final state).
                    fireTextEventOnce(value, firedEvents, gameState);
                } else if (value === "\n") {
                    // Skip non-pause words
                    setDisplaying((prev) => [...prev, value]);
                } else if (typeof value === "object" && "text" in value && !seen.has(value)) {
                    seen.add(value);
                    updateDisplaying(value);
                }
            }

            if (renderTask && !renderTask.isSettled()) {
                renderTask.abort();
            } else {
                completeListeners.forEach((listener) => listener());
                mainTask.resolve();
            }
        };

        gameState.schedule(async (handle) => {
            let exited = false, completed = false;
            while (!exited) {
                // If the task is completed, exit the loop and mark the task as completed
                const { done, value } = iterate();
                if (done) {
                    exited = completed = true;
                    break;
                }

                // A text-event fires its effect the instant it is revealed (contract 2), then the
                // typewriter moves on without rendering anything or waiting.
                if (TextEvent.isTextEvent(value)) {
                    fireTextEventOnce(value, firedEvents, gameState);
                    continue;
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
                    const gameSpeed = game.preference.getPreference(Game.Preferences.gameSpeed);
                    if (pause.config.duration) {
                        // Side Effect Cleanup: state "exited"
                        const duration = pause.config.duration / gameSpeed;
                        await sleep(duration);
                    } else {
                        // Side Effect Cleanup: awaitable skip controller
                        const autoForward = game.preference.getPreference(Game.Preferences.autoForward);
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
                    const { gameSpeed, cps } = game.preference.getPreferences();
                    const baseCps = (typeof value === "object" && "cps" in value && value.cps !== undefined)
                        ? value.cps
                        : cps;
                    const delay = 1000 / (baseCps * gameSpeed);
                    await sleep(delay);
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
            trySkip();
        };
        const update = () => {
            if (renderTask) {
                renderTask.abort();
            }
        };
        const forceSkip = () => {
            trySkip(true);
        };

        return {
            getToken: () => mainTask,
            interact,
            update,
            forceSkip,
            timeline,
            onComplete,
        };
    }

    const sentence = dialog.config.action.sentence;
    if (!sentence) {
        return null;
    }

    const resolvedFontWeightBold = fontWeightBold ?? "bold";
    const calculatedSentence: React.CSSProperties = {
        fontWeight: sentence.config.bold ? resolvedFontWeightBold : fontWeight,
        fontSize: sentence.config.fontSize ?? fontSize,
        color: toOptionalColor(sentence.config.color ?? defaultColor),
        fontFamily: sentence.config.fontFamily ?? fontFamily,
        fontStyle: sentence.config.italic ? "italic" : undefined,
    };

    const calculateStyle = (word: Exclude<SplitWord, Pausing | TextEvent | "\n">): React.CSSProperties => ({
        fontWeight: word.config.bold
            ? resolvedFontWeightBold
            : sentence.config.bold
                ? resolvedFontWeightBold
                : fontWeight,
        fontSize: word.config.fontSize ?? sentence.config.fontSize ?? fontSize,
        color: toOptionalColor(word.config.color ?? sentence.config.color ?? defaultColor),
        fontFamily: word.config.fontFamily ?? sentence.config.fontFamily ?? fontFamily,
        fontStyle: word.config.italic ?? sentence.config.italic ? "italic" : undefined,
    });

    const vertical = isVerticalWritingMode(writingMode);
    const getElement = (word: PureWord, index: number) => {
        if (word === "\n") return (<br key={index} />);
        return (
            <Inspect.Span
                tag={`say.word.${index}`}
                key={index}
                style={{
                    ...calculateStyle(word),
                    ...wordBreakStyleFor(vertical),
                    ...onlyIf<React.CSSProperties>(game.config.app.debug, {
                        outline: "1px dashed red",
                    }),
                }}
                className={clsx(
                    "inline-block",
                    word.config.className,
                )}
            >
                {word.config.ruby ? (
                    <ruby className={"align-bottom inline-block"}>
                        <rt className={"block text-center"}>{word.config.ruby}</rt>
                        {renderWordText(word.text, vertical, tateChuYoko)}
                    </ruby>
                ) : (
                    renderWordText(word.text, vertical, tateChuYoko)
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
                ...calculatedSentence,
                ...verticalContainerStyle(writingMode, textOrientation),
                ...style,
            }}
        >
            {displaying.map(getElement)}
        </div>
    );
}

export type EntryTextsProps = BaseTextsProps & {
    entry: NvlDialogEntry;
    gameState: GameState;
    words: Word<Pausing | string | TextEvent>[];
    useTypeEffect: boolean;
    isActive: boolean;
};

export function TextsPreview({
    text,
    sentence,
    words,
    useTypeEffect = true,
    loop = true,
    restartDelay,
    cps,
    gameSpeed,
    pauseDuration,
    defaultColor,
    className,
    style,
    fontSize,
    fontWeight,
    fontWeightBold,
    fontFamily,
    writingMode,
    textOrientation,
    tateChuYoko,
    onCompleted,
    ...props
}: TextsPreviewProps) {
    const game = useOptionalGame();
    const [, syncPreferenceVersion] = useState(0);
    const gameConfig = game?.config ?? Game.DefaultConfig;
    const gamePreferences = game?.preference.getPreferences() ?? Game.DefaultPreference;
    const resolvedCps = cps ?? gamePreferences.cps;
    const resolvedGameSpeed = gameSpeed ?? gamePreferences.gameSpeed;
    const resolvedPauseDuration = pauseDuration ?? gameConfig.autoForwardDefaultPause;
    const resolvedLoopDelay = restartDelay ?? gameConfig.autoForwardDefaultPause;
    const previewWords = React.useMemo(
        () => getPreviewWords(text, sentence, words),
        [text, sentence, words]
    );
    const loopConfig = React.useMemo(
        () => resolveTextsPreviewLoop(loop, restartDelay, resolvedLoopDelay),
        [loop, restartDelay, resolvedLoopDelay]
    );
    const onCompletedRef = useRef(onCompleted);
    const [displaying, setDisplaying] = useState<PureWord[]>(() => (
        useTypeEffect ? [] : getGeneratedWords(previewWords)
    ));

    useEffect(() => {
        if (!game) {
            return;
        }
        return game.preference.onPreferenceChange(() => {
            syncPreferenceVersion((version) => version + 1);
        }).cancel;
    }, [game]);

    useEffect(() => {
        onCompletedRef.current = onCompleted;
    }, [onCompleted]);

    useEffect(() => {
        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const safeGameSpeed = Math.max(0.01, resolvedGameSpeed);
        const wait = (duration: number) => new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, Math.max(0, duration));
            timers.push(timer);
        });
        const complete = () => {
            if (!cancelled) {
                onCompletedRef.current?.();
            }
        };

        if (!useTypeEffect) {
            setDisplaying(getGeneratedWords(previewWords));
            complete();
            return () => {
                cancelled = true;
            };
        }

        if (previewWords.length === 0) {
            setDisplaying([]);
            return () => {
                cancelled = true;
            };
        }

        const run = async () => {
            do {
                const updater = textUpdater(previewWords);
                setDisplaying([]);

                while (!cancelled) {
                    const { done, value } = updater.next();
                    if (done) {
                        break;
                    }

                    if (Pause.isPause(value)) {
                        const pause = Pause.from(value);
                        await wait((pause.config.duration ?? resolvedPauseDuration) / safeGameSpeed);
                    } else if (TextEvent.isTextEvent(value)) {
                        // Previews are side-effect free: a token reveals nothing and fires nothing.
                        continue;
                    } else {
                        updateDisplayingWord(setDisplaying, value);
                        if (value === "\n") {
                            await wait(getPreviewDelay(resolvedCps, resolvedGameSpeed));
                        } else {
                            await wait(getPreviewDelay(value.cps ?? resolvedCps, resolvedGameSpeed));
                        }
                    }
                }

                if (cancelled) {
                    return;
                }

                complete();

                if (loopConfig.enabled) {
                    await wait(loopConfig.delay);
                }
            } while (!cancelled && loopConfig.enabled);
        };

        void run();

        return () => {
            cancelled = true;
            timers.forEach((timer) => clearTimeout(timer));
        };
    }, [previewWords, useTypeEffect, loopConfig, resolvedCps, resolvedGameSpeed, resolvedPauseDuration]);

    const sentenceConfig = sentence?.config;
    const resolvedFontWeightBold = fontWeightBold ?? "bold";
    const calculatedSentence: React.CSSProperties = {
        fontWeight: sentenceConfig?.bold ? resolvedFontWeightBold : fontWeight,
        fontSize: sentenceConfig?.fontSize ?? fontSize,
        color: toOptionalColor(sentenceConfig?.color ?? defaultColor),
        fontFamily: sentenceConfig?.fontFamily ?? fontFamily,
        fontStyle: sentenceConfig?.italic ? "italic" : undefined,
    };
    const calculateStyle = (word: Exclude<SplitWord, Pausing | TextEvent | "\n">): React.CSSProperties => ({
        fontWeight: word.config.bold
            ? resolvedFontWeightBold
            : sentenceConfig?.bold
                ? resolvedFontWeightBold
                : fontWeight,
        fontSize: word.config.fontSize ?? sentenceConfig?.fontSize ?? fontSize,
        color: toOptionalColor(word.config.color ?? sentenceConfig?.color ?? defaultColor),
        fontFamily: word.config.fontFamily ?? sentenceConfig?.fontFamily ?? fontFamily,
        fontStyle: word.config.italic ?? sentenceConfig?.italic ? "italic" : undefined,
    });
    const vertical = isVerticalWritingMode(writingMode);
    const getElement = (word: PureWord, index: number) => {
        if (word === "\n") return (<br key={index} />);
        return (
            <span
                key={index}
                style={{
                    ...calculateStyle(word),
                    ...wordBreakStyleFor(vertical),
                }}
                className={clsx(
                    "inline-block",
                    word.config.className,
                )}
            >
                {word.config.ruby ? (
                    <ruby className={"align-bottom inline-block"}>
                        <rt className={"block text-center"}>{word.config.ruby}</rt>
                        {renderWordText(word.text, vertical, tateChuYoko)}
                    </ruby>
                ) : (
                    renderWordText(word.text, vertical, tateChuYoko)
                )}
            </span>
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
                ...calculatedSentence,
                ...verticalContainerStyle(writingMode, textOrientation),
                ...style,
            }}
        >
            {displaying.map(getElement)}
        </div>
    );
}

export type RawTextsProps = BaseTextsProps;

export function RawTexts(props: BaseTextsProps) {
    return <BaseText {...props} key={props.dialog?.config.action.id} />;
}

function EntryTexts({
    entry,
    gameState,
    words,
    useTypeEffect,
    isActive,
    ...props
}: EntryTextsProps) {
    const dialogState = useNvlDialogState({
        entry,
        gameState,
        words,
        useTypeEffect,
        isActive,
    });
    return <BaseText {...props} dialog={dialogState} key={dialogState.config.action.id} />;
}

function ContextTexts(props: BaseTextsProps) {
    const context = useDialogContext();
    return (
        <BaseText {...props} dialog={context} key={context.config.action.id} />
    );
}

/**
 * Context-based wrapper component
 * Provides integration with the sentence context
 */
export type TextsProps = BaseTextsProps | EntryTextsProps;

export function Texts(props: BaseTextsProps | EntryTextsProps) {
    if ("entry" in props && props.entry && "gameState" in props && props.gameState && "words" in props && props.words) {
        return <EntryTexts {...props} />;
    }
    return <ContextTexts {...props} />;
}

export default Texts;
