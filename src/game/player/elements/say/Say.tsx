import clsx from "clsx";
import React, {useEffect, useState} from "react";
import {SayElementProps} from "@player/elements/say/type";
import {GameState} from "@core/common/game";
import Sentence from "@player/elements/say/Sentence";
import {onlyIf} from "@lib/util/data";
import {useRatio} from "@player/provider/ratio";

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

    const handleComplete = () => {
        setIsFinished(true);
    };

    function onElementClick() {
        if (isFinished) {
            if (onClick) onClick();
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
    });

    return (
        <div>
            {sentence.state.display &&
                (
                    <div
                        className={
                            clsx(
                                "absolute bottom-0 w-[calc(100%-40px)]",
                                className,
                                {
                                    "min-h-[calc(33%-40px)] bg-white flex flex-col items-start justify-between":
                                        !game.config.elements.text.useAspectScale,
                                    [game.config.elementStyles.say.containerClassName]: !game.config.elements.text.useAspectScale,
                                }
                            )
                        }
                        onClick={onElementClick}
                        style={{
                            ...onlyIf<React.CSSProperties>(game.config.elements.text.useAspectScale, {
                                width: game.config.elements.text.width,
                                height: game.config.elements.text.height,
                            }),
                            ...onlyIf<React.CSSProperties>(game.config.app.debug, {
                                border: "1px solid green",
                            }),
                        }}
                    >
                        <div
                            className={clsx(
                                {
                                    "bg-white flex flex-col items-start justify-between": game.config.elements.text.useAspectScale,
                                    [game.config.elementStyles.say.containerClassName]: game.config.elements.text.useAspectScale,
                                }
                            )}
                            style={{
                                ...onlyIf<React.CSSProperties>(game.config.elements.text.useAspectScale, {
                                    transform: `scale(${ratio.state.scale})`,
                                    transformOrigin: "bottom left",
                                    width: "100%",
                                    height: "100%",
                                }),
                            }}
                        >
                            <div
                                className={clsx("rounded-br-md", game.config.elementStyles.say.nameTextClassName)}>
                                {sentence.config.character?.state.name}
                            </div>
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
                    </div>
                )
            }
        </div>
    );
};