import { Pause, Pausing } from "@core/elements/character/pause";
import { Sentence } from "@core/elements/character/sentence";
import { Word, WordConfig } from "@core/elements/character/word";
import { Game, GameState } from "@lib/game/nlcore/common/game";
import { Color, LiveGameEventToken } from "@lib/game/nlcore/types";
import { Awaitable, onlyIf, SkipController, sleep, toHex } from "@lib/util/data";
import Inspect from "@player/lib/Inspect";
import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";
import { useFlush } from "../../lib/flush";
import { useGame } from "../../provider/game-state";
import { Timeline } from "../../Tasks";
import { useDialogContext } from "./context";
import { DialogElementProps } from "./type";
import { DialogState } from "./UIDialog";

/**@internal */
type SplitWord = {
    text: string;
    config: Partial<WordConfig>;
    tag: any;
    tag2?: any;
    cps?: number;
} | "\n" | Pausing;

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
    update: () => void;
    forceSkip: () => void;
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
    return <BaseText {...props} key={props.dialog?.config.action.id} />;
}

/**
 * Context-based wrapper component
 * Provides integration with the sentence context
 */
export function Texts(props: BaseTextsProps) {
    const context = useDialogContext();
    return (
        <BaseText {...props} dialog={context} key={context.config.action.id} />
    );
}

export default Texts;