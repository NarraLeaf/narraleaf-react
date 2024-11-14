import clsx from "clsx";
import React, {useEffect, useState} from "react";
import {SayElementProps} from "@player/elements/say/type";
import {GameState} from "@core/common/game";
import Sentence from "@player/elements/say/Sentence";
import {onlyIf, Scheduler} from "@lib/util/data";
import {useRatio} from "@player/provider/ratio";
import Inspect from "@player/lib/Inspect";
import {Game} from "@core/game";

export default function Say(
    {
        action,
        onClick,
        useTypeEffect = true,
        className,
        state,
    }: Readonly<SayElementProps>) {
    const {sentence} = action;
    const [isFinished, setIsFinished] = useState(false);
    const {game} = state;
    const [count, setCount] = useState(0);
    const {ratio} = useRatio();
    const [scheduler] = useState(new Scheduler());

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
            if (game.config.elements.say.nextKey.includes(e.key)) {
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
        const gameEvents = state.events.onEvents([
            {
                type: GameState.EventTypes["event:state.player.skip"],
                listener: state.events.on(GameState.EventTypes["event:state.player.skip"], () => {
                    state.logger.log("NarraLeaf-React: Say", "Skipped");
                    if (isFinished) {
                        if (onClick) onClick();
                    } else {
                        setIsFinished(true);
                    }
                }),
            }
        ]);

        return () => {
            gameEvents.cancel();
        };
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
            }, game.config.elements.say.autoForwardDelay);
    }

    return (
        <div>
            {sentence.state.display &&
                (
                    <Inspect.Div
                        tag={"say.aspectScaleContainer"}
                        color={"blue"}
                        border={"dashed"}
                        className={
                            clsx(
                                "absolute bottom-0 w-[calc(100%-40px)]",
                                className,
                            )
                        }
                        onClick={onElementClick}
                        style={{
                            ...onlyIf<React.CSSProperties>(game.config.elements.say.useAspectScale, {
                                width: game.config.elements.text.width,
                                height: game.config.elements.text.height,
                            }),
                        }}
                    >
                        <Inspect.Div
                            tag={"say.containerClassName"}
                            className={clsx(
                                game.config.elementStyles.say.containerClassName
                            )}
                            style={{
                                ...onlyIf<React.CSSProperties>(game.config.elements.say.useAspectScale, {
                                    transform: `scale(${ratio.state.scale})`,
                                    transformOrigin: "bottom left",
                                    width: "100%",
                                    height: "100%",
                                }),
                            }}
                        >
                            <div
                                className={clsx(
                                    "bg-white flex flex-col items-start justify-between",
                                    game.config.elementStyles.say.contentContainerClassName,
                                    "w-full h-full"
                                )}
                            >
                                <Inspect.Div
                                    tag={"say.nameTextClassName"}
                                    className={clsx("rounded-br-md text-black", game.config.elementStyles.say.nameTextClassName)}>
                                    {sentence.config.character?.state.name}
                                </Inspect.Div>
                                <Sentence
                                    sentence={sentence}
                                    gameState={state}
                                    finished={isFinished}
                                    useTypeEffect={useTypeEffect}
                                    onCompleted={handleComplete}
                                    count={count}
                                />
                                <div></div>
                            </div>
                        </Inspect.Div>
                    </Inspect.Div>
                )
            }
        </div>
    );
};