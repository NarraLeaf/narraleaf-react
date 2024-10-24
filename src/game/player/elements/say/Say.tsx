import clsx from "clsx";
import React, {useEffect, useState} from "react";
import Isolated from "@player/lib/isolated";
import {SayElementProps} from "@player/elements/say/type";
import {GameState} from "@core/common/game";
import Sentence from "@player/elements/say/Sentence";

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
        <Isolated className={"absolute"}>
            {sentence.state.display &&
                (
                    <div className={
                        clsx(
                            "absolute bottom-0 w-[calc(100%-40px)] min-h-[calc(33%-40px)] m-4 bg-white flex flex-col items-start justify-between",
                            game.config.elementStyles.say.containerClassName,
                            className
                        )
                    } onClick={onElementClick}>
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
                )
            }
        </Isolated>
    );
};