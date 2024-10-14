import clsx from "clsx";
import React, {useEffect, useState} from "react";
import Isolated from "@player/lib/isolated";
import TypingEffect from "./TypingEffect";
import {toHex} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import {SayElementProps} from "@player/elements/say/type";
import {Character} from "@core/elements/character";
import {GameState} from "@core/common/game";
import {Word} from "@core/elements/character/word";


export default function Say(
    {
        action,
        onClick,
        useTypeEffect = true,
        className,
        state,
    }: Readonly<SayElementProps>) {
    const {sentence, character} = action;
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const {game} = useGame();

    const handleComplete = () => {
        setCurrentWordIndex((prevIndex) => prevIndex + 1);
        if (currentWordIndex === sentence.text.length - 1) {
            setIsFinished(true);
        }
    };

    function onElementClick() {
        if (isFinished) {
            if (onClick) onClick();
        } else {
            setIsFinished(true);
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
                    setIsFinished(true);
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
        <Isolated className={"absolute"}>
            {sentence.state.display &&
                ((!character || character.config.mode === Character.Modes.adv) ?
                        (<div className={
                            clsx(
                                "absolute flex items-center justify-center bottom-0 w-[calc(100%-40px)] h-[calc(33%-40px)] m-4 bg-white",
                                game.config.elementStyles.say.container,
                                className
                            )
                        } onClick={onElementClick}>
                            <div
                                className={clsx("absolute top-0 left-0 p-1.25 rounded-br-md m-4", game.config.elementStyles.say.nameText)}>
                                {sentence.config.character?.state.name}
                            </div>
                            <div
                                className={clsx("text-center max-w-[80%] mx-auto", game.config.elementStyles.say.textContainer)}>
                                {
                                    sentence.text.map((word, index) => {
                                        const color = word.config.color || sentence.config.color || Word.defaultColor;
                                        if (isFinished) return (
                                            <span
                                                key={index}
                                                style={{
                                                    color: typeof color === "string" ? color : toHex(color)
                                                }}
                                                className={clsx(game.config.elementStyles.say.textSpan)}
                                            >{word.text}</span>
                                        );
                                        if (index > currentWordIndex) return null;
                                        return (
                                            <span
                                                key={index}
                                                style={{
                                                    color: toHex(color)
                                                }} className={clsx(game.config.elementStyles.say.textSpan)}
                                            >{
                                                useTypeEffect ?
                                                    <TypingEffect
                                                        text={word.text}
                                                        onComplete={index === currentWordIndex ? handleComplete : undefined}
                                                        speed={game.config.elements.say.textInterval}
                                                        className={clsx(game.config.elementStyles.say.textSpan)}
                                                    /> :
                                                    word.text
                                            }</span>
                                        );
                                    })
                                }
                            </div>
                        </div>) : (<> </>)
                )
            }
        </Isolated>
    );
};