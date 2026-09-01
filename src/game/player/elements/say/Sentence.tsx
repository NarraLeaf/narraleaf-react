import { Pause, Pausing } from "@core/elements/character/pause";
import { TextEvent } from "@core/elements/character/textEvent";
import { Sentence, type StaticWord } from "@core/elements/character/sentence";
import { Word, WordConfig, WordRenderProps } from "@core/elements/character/word";
import { Game, GameState } from "@lib/game/nlcore/common/game";
import { Color, LiveGameEventToken } from "@lib/game/nlcore/types";
import { Awaitable, onlyIf, SkipController, sleep, toHex } from "@lib/util/data";
import Inspect from "@player/lib/Inspect";
import clsx from "clsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFlush } from "../../lib/flush";
import { useGame, useOptionalGame } from "../../provider/game-state";
import { Timeline } from "../../Tasks";
import { useDialogContext } from "./context";
import { DialogState } from "./UIDialog";
import { useNvlDialogState } from "../nvl/useNvlDialogState";
import type { NvlDialogEntry } from "@player/gameState";
import { fireInstantRevealEvents, fireTextEventOnce } from "./textEventEffect";
import { resolveWordRenderer } from "./wordRenderer";
import {
    AUTO_FIT_SCALE_VAR,
    DEFAULT_AUTO_FIT_MIN_FONT_SIZE,
    inheritedScaledFontSize,
    scaledFontSize,
    useAutoFitScale,
} from "./autoFit";
import { emphasisStyle, previewWordFontSize, wordFontSize } from "./wordStyle";
import { REVEAL_DURATION_VAR, resolveRevealTiming, revealTailFor, type RevealTiming } from "./textReveal";
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
    /**
     * The whole word this character came from, revealed or not. Carried on every character so a
     * custom renderer can tell a half-typed word from a finished one without reaching back into the
     * evaluated sentence.
     */
    full: string;
    config: Partial<WordConfig>;
    tag: any;
    tag2?: any;
    cps?: number;
    /**
     * How many of this fragment's leading characters arrived all at once rather than one at a
     * time, and so must not be faded in.
     *
     * A skip lands the whole rest of the line in a single render. Every one of those characters
     * mounts together, and mounting is what starts a fade - so without this the line appears at
     * once and then its last few characters fade in behind it, which is the opposite of what the
     * player just asked for. It is carried per fragment rather than held beside the line because
     * the typewriter goes on growing the same fragment afterwards, and those characters do fade.
     */
    revealFrom?: number;
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
                    full: word.text,
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
    /**
     * Keep the line inside the box it is placed in by setting it down as it is typed.
     *
     * The line is set at `fontSize` and stays there for as long as it fits, so a short line is
     * never set small. Once the text reaches the end of the box, every further character is
     * measured and the size comes down by what it takes to fit, to no less than
     * {@link autoFitMinFontSize}. A line that still overflows at that size is left overflowing.
     *
     * Sizes carried by the sentence or by a single word are scaled with the line rather than
     * replaced, so their relative weights hold at any size, and a run set larger or smaller inside
     * the line is accounted for by having been drawn rather than by being predicted.
     *
     * The box is the container's parent, which needs a size of its own for anything to be fitted
     * to. {@link GameConfig.disableTextScaling} turns this off for the whole game.
     * @default true
     */
    autoFit?: boolean;
    /**
     * The smallest size text scaling sets, in px. A line that still overflows at it is left
     * overflowing.
     * @default 12
     */
    autoFitMinFontSize?: number;
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

/**
 * Every word of a sentence, laid out the way the typewriter leaves it.
 *
 * The characters are merged back into their words exactly as {@link updateDisplayingWord} merges
 * them while typing: a word drawn as one element per character would be free to break between any
 * two of them, so a Latin word would come apart and the line would wrap differently from the same
 * line typed out.
 * @internal
 */
export function getGeneratedWords(words: Word<Pausing | string | TextEvent>[]): PureWord[] {
    const generator = textUpdater(words);
    const result: PureWord[] = [];
    for (const value of generator) {
        if (Pause.isPause(value) || TextEvent.isTextEvent(value)) {
            continue;
        }
        const last = result[result.length - 1];
        if (last && last !== "\n" && value !== "\n" && last.tag === value.tag) {
            const text = last.text + value.text;
            result[result.length - 1] = {
                ...value,
                text,
                config: value.config,
                revealFrom: text.length,
            };
            continue;
        }
        result.push(value === "\n" ? value : { ...value, revealFrom: value.text.length });
    }
    return result;
}

/**
 * Where each word starts among the characters revealed so far, and how many there are.
 *
 * The count is what asks text scaling for its next measurement; the offsets are what tells a word
 * which of its own characters are among the newest few in the line, and so still fading in.
 * @internal
 */
export function revealOffsets(displaying: PureWord[]): { offsets: number[], revealed: number } {
    const offsets: number[] = [];
    let revealed = 0;
    for (const word of displaying) {
        offsets.push(revealed);
        revealed += word === "\n" ? 1 : word.text.length;
    }
    return { offsets, revealed };
}

/**
 * The line with one more piece of text on the end of it.
 *
 * `instant` is what the caller knows and the words do not: whether this arrived on its own -
 * the typewriter - or as part of a run landing in a single render, which is what a skip is.
 * Characters that arrived in a run are marked as already settled, so a skipped line is drawn at
 * full strength instead of fading in behind itself.
 * @internal
 */
export function appendDisplayingWord(
    prev: PureWord[],
    value: Exclude<SplitWord, Pausing | TextEvent>,
    instant: boolean = false,
): PureWord[] {
    const last = prev[prev.length - 1];
    if (last && last !== "\n" && value !== "\n" && last.tag === value.tag) {
        const text = last.text + value.text;
        return [...prev.slice(0, -1), {
            ...value,
            text,
            config: value.config,
            // A run settles everything before it; a typed character leaves the mark where it is.
            revealFrom: instant ? text.length : last.revealFrom,
        }];
    }
    if (value === "\n") {
        return [...prev, value];
    }
    return [...prev, { ...value, revealFrom: instant ? value.text.length : 0 }];
}

function updateDisplayingWord(
    setDisplaying: React.Dispatch<React.SetStateAction<PureWord[]>>,
    value: Exclude<SplitWord, Pausing | TextEvent>,
    instant: boolean = false,
) {
    setDisplaying((prev) => appendDisplayingWord(prev, value, instant));
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

/**@internal */
export type WordBodyProps = {
    word: Exclude<PureWord, "\n">;
    vertical: boolean;
    tateChuYoko: TateChuYoko | undefined;
    done: boolean;
    style: React.CSSProperties;
    renderer: React.ComponentType<WordRenderProps<any>> | null;
    /**
     * How many of this word's trailing characters are still fading in. `0` - the default, and what
     * every line that is not being typed out gets - draws the word exactly as it is drawn without
     * the reveal effect.
     */
    revealTail?: number;
};

/**
 * Whether the typewriter has passed the last character of the word this fragment came from.
 *
 * Read off the character's own index rather than the length of what has been revealed, because a
 * word containing a line break is drawn as one fragment per line — the break itself is a `<br />`
 * between them and belongs to neither — so the revealed text is shorter than the word for as long
 * as the word exists. The last line still ends on the word's last character, which is what this
 * asks about.
 * @internal
 */
function isWordRevealed(word: Exclude<PureWord, "\n">): boolean {
    if (typeof word.tag2 === "number") {
        return word.tag2 >= word.full.length - 1;
    }
    return word.text.length >= word.full.length;
}

/**
 * What goes inside the element the engine styles: the laid-out text, wrapped in the word's own
 * renderer when it has one.
 *
 * The renderer is handed the laid-out text as `children` rather than the raw string, so ruby,
 * vertical writing mode and tate-chu-yoko survive a renderer that does not know they exist.
 * @internal
 */
export function WordBody({ word, vertical, tateChuYoko, done, style, renderer: Renderer, revealTail = 0 }: WordBodyProps) {
    const content = word.config.ruby ? (
        <ruby className={"align-bottom inline-block"}>
            <rt className={"block text-center"}>{word.config.ruby}</rt>
            {renderWordText(word.text, vertical, tateChuYoko, revealTail)}
        </ruby>
    ) : (
        renderWordText(word.text, vertical, tateChuYoko, revealTail)
    );

    if (!Renderer) {
        return content;
    }

    return (
        <Renderer
            text={word.text}
            fullText={word.full}
            revealed={isWordRevealed(word)}
            done={done}
            style={style}
            config={word.config}
            data={word.config.data}
        >
            {content}
        </Renderer>
    );
}

/**
 * Whether a word has finished revealing and so should take its own clicks rather than let them
 * advance the line. A word still being typed does not: the player clicking mid-word asked for the
 * rest of the line, not for whatever the word does.
 * @internal
 */
function isInteractiveWord(
    word: Exclude<PureWord, "\n">,
    renderer: React.ComponentType<WordRenderProps<any>> | null
): boolean {
    return !!renderer && isWordRevealed(word);
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
        autoFit,
        autoFitMinFontSize,
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
     * Re-render when the line settles.
     *
     * A custom word renderer is told whether the line has finished — a glossary term that only
     * offers itself once the player has read the whole line needs to know. Completion arrives as a
     * flush, not as a change to `displaying`, so without this the last character would be drawn
     * with the line still reading as unfinished and nothing would come along to correct it.
     */
    useEffect(() => {
        return dialog.onFlush(() => {
            flush();
        }).cancel;
    }, [dialog]);

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
            }),
            // The fade is read as the line is drawn rather than while it is paced, so this one
            // asks for a redraw instead of restarting the wait the typewriter is in.
            game.preference.onPreferenceChange(Game.Preferences.textRevealDuration, () => {
                flush();
            })
        ]).cancel;
    }, []);

    // The game-wide switch wins over the line's own: a game that has turned text scaling off has
    // decided nothing on screen resizes itself, whoever asked for it.
    const autoFitEnabled = (autoFit ?? true) && !game.config.disableTextScaling;
    // How many characters are on screen, and where each word starts among them. The count changes
    // with every character, which is what asks for the next measurement; the number of words does
    // not (the typewriter grows the last one). The offsets are what tells a word which of its own
    // characters are among the newest few in the line.
    const { offsets, revealed } = useMemo(() => revealOffsets(displaying), [displaying]);
    // The reveal effect belongs to text being typed, not to text being on screen: a line revealed
    // at once, one skipped to the end, and one drawn again from a save or an NVL re-mount are all
    // finished text and are drawn as they always were. Read straight from the preferences rather
    // than held in state - every character re-renders this anyway, so a speed the player changes
    // mid-line is picked up by the next one.
    const revealTiming: RevealTiming = resolveRevealTiming(
        dialog.config.useTypeEffect ? game.preference.getPreference(Game.Preferences.textRevealDuration) : 0,
        game.preference.getPreference(Game.Preferences.cps),
        game.preference.getPreference(Game.Preferences.gameSpeed),
    );
    const { containerRef, scale: autoFitScale } = useAutoFitScale({
        enabled: autoFitEnabled,
        minFontSize: autoFitMinFontSize ?? DEFAULT_AUTO_FIT_MIN_FONT_SIZE,
        vertical: isVerticalWritingMode(writingMode),
        revealed,
    });

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
        const updateDisplaying = (value: Exclude<SplitWord, Pausing | TextEvent>, instant: boolean = false) => {
            updateDisplayingWord(setDisplaying, value, instant);
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
                    // Landing in a run: every character of the rest of the line is drawn at full
                    // strength, including the ones already part-way through a fade.
                    updateDisplaying(value, true);
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
    const authoredFontSize = sentence.config.fontSize ?? fontSize;
    const calculatedSentence: React.CSSProperties = {
        fontWeight: sentence.config.bold ? resolvedFontWeightBold : fontWeight,
        // Every size in the line is written against one multiplier rather than replaced by a
        // computed number, so a size the sentence or a single word set for itself keeps its weight
        // against the rest of the line at any scale.
        fontSize: scaledFontSize(authoredFontSize) ?? inheritedScaledFontSize(),
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
        fontSize: wordFontSize(word.config, authoredFontSize),
        color: toOptionalColor(word.config.color ?? sentence.config.color ?? defaultColor),
        fontFamily: word.config.fontFamily ?? sentence.config.fontFamily ?? fontFamily,
        fontStyle: word.config.italic ?? sentence.config.italic ? "italic" : undefined,
        ...emphasisStyle(word.config.emphasis),
    });

    const vertical = isVerticalWritingMode(writingMode);
    const done = dialog.isEnded();
    const getElement = (word: PureWord, index: number) => {
        if (word === "\n") return (<br key={index} />);
        const wordStyle = calculateStyle(word);
        const renderer = resolveWordRenderer(word.config.render);
        const interactive = isInteractiveWord(word, renderer);
        return (
            <Inspect.Span
                tag={`say.word.${index}`}
                key={index}
                // Read by StageClickAnnouncer, which listens natively below the React root and so
                // cannot be stopped by the handler beside it. Both are needed: the attribute keeps
                // the stage from advancing, `stopPropagation` keeps the dialog box from doing it.
                data-element-type={interactive ? "interactive-word" : undefined}
                onClick={interactive ? (event: React.MouseEvent) => event.stopPropagation() : undefined}
                style={{
                    ...wordStyle,
                    ...wordBreakStyleFor(),
                    ...onlyIf<React.CSSProperties>(game.config.app.debug, {
                        outline: "1px dashed red",
                    }),
                }}
                className={clsx(
                    "inline-block",
                    word.config.className,
                )}
            >
                <WordBody
                    word={word}
                    vertical={vertical}
                    tateChuYoko={tateChuYoko}
                    done={done}
                    style={wordStyle}
                    renderer={renderer}
                    revealTail={revealTailFor(revealTiming, offsets[index] ?? 0, word.text.length, revealed, word.revealFrom ?? 0)}
                />
            </Inspect.Span>
        );
    };

    return (
        <div
            {...props}
            ref={containerRef}
            className={clsx(
                "whitespace-pre-wrap",
                className,
            )}
            style={{
                // The multiplier every size inside the line is written against, and how long a
                // character of it takes to fade in.
                ...({
                    [AUTO_FIT_SCALE_VAR]: autoFitScale,
                    ...onlyIf(revealTiming.duration > 0, { [REVEAL_DURATION_VAR]: `${revealTiming.duration}ms` }),
                } as React.CSSProperties),
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
        fontSize: previewWordFontSize(word.config, sentenceConfig?.fontSize ?? fontSize),
        color: toOptionalColor(word.config.color ?? sentenceConfig?.color ?? defaultColor),
        fontFamily: word.config.fontFamily ?? sentenceConfig?.fontFamily ?? fontFamily,
        fontStyle: word.config.italic ?? sentenceConfig?.italic ? "italic" : undefined,
        ...emphasisStyle(word.config.emphasis),
    });
    const vertical = isVerticalWritingMode(writingMode);
    // A sample line is typed the same way a real one is, so it fades the same way - a settings
    // screen showing the typewriter should show what the game does with it.
    const revealTiming = resolveRevealTiming(
        useTypeEffect ? gamePreferences.textRevealDuration : 0,
        resolvedCps,
        resolvedGameSpeed,
    );
    const { offsets, revealed } = revealOffsets(displaying);
    const getElement = (word: PureWord, index: number) => {
        if (word === "\n") return (<br key={index} />);
        const wordStyle = calculateStyle(word);
        return (
            <span
                key={index}
                style={{
                    ...wordStyle,
                    ...wordBreakStyleFor(),
                }}
                className={clsx(
                    "inline-block",
                    word.config.className,
                )}
            >
                <WordBody
                    word={word}
                    vertical={vertical}
                    tateChuYoko={tateChuYoko}
                    // A preview is a loop with no line behind it, so nothing here is ever "the line
                    // has finished"; a renderer that gates on `done` stays inert, which is the right
                    // reading of a settings-screen sample.
                    done={false}
                    style={wordStyle}
                    renderer={resolveWordRenderer(word.config.render)}
                    revealTail={revealTailFor(revealTiming, offsets[index] ?? 0, word.text.length, revealed, word.revealFrom ?? 0)}
                />
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
                ...onlyIf(revealTiming.duration > 0, { [REVEAL_DURATION_VAR]: `${revealTiming.duration}ms` }) as React.CSSProperties,
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
