import React from "react";
import clsx from "clsx";

import {Choice} from "@core/elements/menu";
import {MenuElementProps} from "@player/elements/menu/type";
import Isolated from "@player/lib/isolated";
import {useGame} from "@player/provider/game-state";
import Sentence from "@player/elements/say/Sentence";

export default function Menu(
    {
        prompt,
        choices,
        afterChoose,
        state,
    }: Readonly<MenuElementProps>) {
    const {game} = useGame();

    const Say = game.config.elements.say.use;

    function choose(choice: Choice) {
        afterChoose(choice);
    }

    return (
        <>
            <Isolated className={"absolute"}>
                <div className="absolute flex flex-col items-center justify-center min-w-full w-full h-full">
                    {prompt && <Say
                        state={state}
                        action={{sentence: prompt, character: null}}
                        useTypeEffect={false}
                        className="z-10"
                    />}
                </div>
            </Isolated>
            <Isolated className={"absolute"}>
                <div className={clsx(
                    "absolute flex flex-col items-center justify-center min-w-full w-full h-full",
                    game.config.elementStyles.menu.containerClassName
                )}>
                    <div className="p-4 rounded-lg w-full z-20">
                        <div className="flex flex-col items-center mt-4 w-full">
                            {choices.map((choice, i) => (
                                <button
                                    key={i}
                                    className={clsx(
                                        "bg-white text-black p-2 mt-2 w-1/2",
                                        game.config.elementStyles.menu.choiceButtonClassName
                                    )}
                                    onClick={() => choose(choice)}
                                >
                                    <Sentence
                                        sentence={choice.prompt}
                                        gameState={state}
                                        useTypeEffect={false}
                                        className={clsx(game.config.elementStyles.menu.choiceButtonTextClassName)}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Isolated>
        </>
    );
};