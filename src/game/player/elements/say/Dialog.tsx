import clsx from "clsx";
import React, {useEffect, useState} from "react";
import {DialogProps} from "@player/elements/say/type";
import {GameState} from "@core/common/game";
import {onlyIf, Scheduler} from "@lib/util/data";
import {useRatio} from "@player/provider/ratio";
import Inspect from "@player/lib/Inspect";
import {Game} from "@core/game";
import { Nametag, usePreference } from "@player/libElements";
import { SentenceContext, useSayContext } from "./context";
import { Texts } from "./Sentence";
import { Sentence } from "@core/elements/character/sentence";
import { Word } from "@core/elements/character/word";
import { Pausing } from "@core/elements/character/pause";

/**
 * Base component that handles the core dialog rendering logic
 * This component is not meant to be used directly
 */
interface BaseDialogProps extends Omit<DialogProps, "onClick"> {
    sentence: Sentence;
    words: Word<Pausing | string>[];
    gameState: GameState;
    useTypeEffect?: boolean;
    onClick?: (skiped?: boolean) => void;
    onFinished?: () => void;
}

function BaseDialog({
    children,
    sentence,
    words,
    gameState,
    useTypeEffect = true,
    onClick,
    onFinished,
    ...props
}: BaseDialogProps) {
    const [isFinished, setIsFinished] = useState(false);
    const {game} = gameState;
    const [count, setCount] = useState(0);
    const {ratio} = useRatio();
    const [scheduler] = useState(new Scheduler());
    const [showDialog] = usePreference(Game.Preferences.showDialog);

    const handleComplete = () => {
        setIsFinished(true);
        onFinished?.();
        scheduleAutoForward();
    };

    function onElementClick() {
        if (isFinished) {
            if (onClick) onClick();
            scheduleAutoForward();
        } else {
            setCount((count) => count + 1);
        }
    }

    useEffect(() => {
        if (!window) {
            console.warn("Failed to add event listener, window is not available\nat Say.tsx: onElementClick");
            return;
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            if (game.config.nextKey.includes(e.key)) {
                if (isFinished) {
                    if (onClick) onClick();
                } else {
                    setCount((count) => count + 1);
                }
            }
        };

        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [isFinished]);

    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.skip"], () => {
            gameState.logger.log("NarraLeaf-React: Say", "Skipped");
            if (isFinished) {
                if (onClick) onClick(true);
            } else {
                setIsFinished(true);
                onFinished?.();
            }
        }).cancel;
    }, [isFinished]);

    useEffect(() => {
        const event = game.preference.onPreferenceChange(Game.Preferences.autoForward, (autoForward) => {
            if (autoForward && isFinished) {
                scheduleAutoForward();
            } else {
                scheduler.cancelTask();
            }
        });
        return () => {
            event.cancel();
        };
    }, [isFinished]);

    useEffect(() => () => {
        scheduler.cancelTask();
    }, []);

    function scheduleAutoForward() {
        if (!game.preference.getPreference(Game.Preferences.autoForward)) return;
        scheduler
            .cancelTask()
            .scheduleTask(() => {
                if (onClick) onClick();
            }, game.config.autoForwardDelay);
    }

    const sentenceContext: SentenceContext = {
        sentence,
        gameState,
        finished: isFinished,
        useTypeEffect,
        count,
        words,
        onCompleted: handleComplete,
    };

    return (
        <SentenceContext.Provider value={sentenceContext}>
            <div data-element-type={"dialog"}>
                {sentence.state.display && (
                    <Inspect.Div
                        tag={"say.aspectScaleContainer"}
                        color={"blue"}
                        border={"dashed"}
                        className={clsx(
                            "absolute bottom-0 w-[calc(100%-40px)]",
                            !showDialog && "invisible pointer-events-auto"
                        )}
                        onClick={onElementClick}
                        style={{
                            ...onlyIf<React.CSSProperties>(game.config.useAspectScale, {
                                width: game.config.dialogWidth,
                                height: game.config.dialogHeight,
                            }),
                        }}
                    >
                        <Inspect.Div
                            tag={"say.containerClassName"}
                            style={{
                                ...onlyIf<React.CSSProperties>(game.config.useAspectScale, {
                                    transform: `scale(${ratio.state.scale})`,
                                    transformOrigin: "bottom left",
                                    width: "100%",
                                    height: "100%",
                                }),
                            }}
                        >
                            <div {...props}>
                                {children}
                            </div>
                        </Inspect.Div>
                    </Inspect.Div>
                )}
            </div>
        </SentenceContext.Provider>
    );
}

/**
 * Props-based wrapper component
 * Provides a clean interface for direct prop usage
 */
export interface RawDialogProps extends Omit<DialogProps, "onClick"> {
    sentence: Sentence;
    words: Word<Pausing | string>[];
    gameState: GameState;
    useTypeEffect?: boolean;
    onClick?: (skiped?: boolean) => void;
    onFinished?: () => void;
}

export function RawDialog(props: RawDialogProps) {
    return <BaseDialog {...props} />;
}

/**
 * Context-based wrapper component
 * Provides integration with the say context
 */
export function Dialog({children, ...props}: DialogProps) {
    const context = useSayContext();
    return (
        <BaseDialog
            {...props}
            sentence={context.action.sentence}
            words={context.action.words}
            gameState={context.gameState}
            useTypeEffect={context.useTypeEffect}
            onClick={context.onClick}
            onFinished={context.onFinished}
        >
            {children}
        </BaseDialog>
    );
}

// Export Dialog as default for backward compatibility
export default Dialog;

/**
 * Default dialog component with Texts as children
 */
export function DefaultDialog() {
    return (
        <Dialog>
            <Nametag />
            <Texts />
        </Dialog>
    );
}

