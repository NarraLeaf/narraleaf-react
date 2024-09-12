import clsx from "clsx";
import React, {useEffect, useState} from "react";
import Isolated from "@player/lib/isolated";
import TypingEffect from "./TypingEffect";
import {toHex} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import {SayElementProps} from "@player/elements/say/type";


export default function Say({
                                action,
                                onClick,
                                useTypeEffect = true,
                                className,
                            }: Readonly<SayElementProps>) {
    const {sentence} = action;
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

        const handleKeyDown = (e: KeyboardEvent) => {
            if (game.config.elements.say.skipKeys.includes(e.key)) {
                if (isFinished) {
                    if (onClick) onClick();
                } else {
                    setIsFinished(true);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isFinished]);

    return (
        <Isolated className={"absolute"}>
            {sentence.state.display &&
                <div className={
                    clsx(
                        "absolute flex items-center justify-center bottom-0 w-[calc(100%-40px)] h-[calc(33%-40px)] m-4 bg-white",
                        game.config.elementStyles.say.container,
                        className
                    )
                } onClick={onElementClick}>
                    <div
                        className={clsx("absolute top-0 left-0 p-1.25 rounded-br-md m-4", game.config.elementStyles.say.nameText)}>
                        {sentence.character?.name || ""}
                    </div>
                    <div
                        className={clsx("text-center max-w-[80%] mx-auto", game.config.elementStyles.say.textContainer)}>
                        {
                            sentence.text.map((word, index) => {
                                if (isFinished) return (
                                    <span key={index} style={{
                                        color: typeof word.config.color === "string" ? word.config.color : toHex(word.config.color)
                                    }} className={clsx(game.config.elementStyles.say.textSpan)}>
                                        {word.text}
                                    </span>
                                );
                                if (index > currentWordIndex) return null;
                                return (
                                    <span key={index} style={{
                                        color: toHex(word.config.color)
                                    }}>
                                        {
                                            useTypeEffect ?
                                                <TypingEffect
                                                    text={word.text}
                                                    onComplete={index === currentWordIndex ? handleComplete : undefined}
                                                    speed={game.config.elements.say.textSpeed}
                                                    className={clsx(game.config.elementStyles.say.textSpan)}
                                                /> :
                                                word.text
                                        }
                                    </span>
                                );
                            })
                        }
                    </div>
                </div>
            }
        </Isolated>
    );
};