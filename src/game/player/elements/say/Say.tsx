import clsx from "clsx";
import React, {useEffect, useState} from "react";
import {IDialogProps, SayElementProps} from "@player/elements/say/type";
import {GameState} from "@core/common/game";
import Texts from "@player/elements/say/Sentence";
import {onlyIf, Scheduler} from "@lib/util/data";
import {useRatio} from "@player/provider/ratio";
import Inspect from "@player/lib/Inspect";
import {Game} from "@core/game";
import { usePreference } from "@player/libElements";
import { SentenceContext, useSayContext } from "./context";

export default function Dialog(
    {
        children,
        ...props
    }: Readonly<IDialogProps>) {
    const {
        action,
        onClick,
        useTypeEffect = true,
        gameState,
    } = useSayContext();
    const {sentence, words} = action;
    const [isFinished, setIsFinished] = useState(false);
    const {game} = gameState;
    const [count, setCount] = useState(0);
    const {ratio} = useRatio();
    const [scheduler] = useState(new Scheduler());
    const [showDialog] = usePreference(Game.Preferences.showDialog);

    const handleComplete = () => {
        setIsFinished(true);
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
        gameState: gameState,
        finished: isFinished,
        useTypeEffect,
        count,
        words,
    };

    return (
        <SentenceContext value={sentenceContext}>
            <div>
                {sentence.state.display && showDialog &&
                    (
                    <Inspect.Div
                        tag={"say.aspectScaleContainer"}
                        color={"blue"}
                        border={"dashed"}
                        className={
                            clsx(
                                "absolute bottom-0 w-[calc(100%-40px)]",
                            )
                        }
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
                            className={clsx(
                                game.config.elementStyles.say.containerClassName
                            )}
                            style={{
                                ...onlyIf<React.CSSProperties>(game.config.useAspectScale, {
                                    transform: `scale(${ratio.state.scale})`,
                                    transformOrigin: "bottom left",
                                    width: "100%",
                                    height: "100%",
                                }),
                            }}
                        >
                            <div
                                {...props} /* "bg-white flex flex-col items-start justify-between w-full h-full" */
                            >
                                <Inspect.Div
                                    tag={"say.nameTextClassName"}
                                    className={clsx("rounded-br-md text-black", game.config.elementStyles.say.nameTextClassName)}>
                                    {sentence.config.character?.state.name}
                                </Inspect.Div>
                                {children}
                                <div></div>
                            </div>
                        </Inspect.Div>
                    </Inspect.Div>
                )
            }
        </div>
        </SentenceContext>
    );
};


