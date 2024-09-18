import React from "react";
import clsx from "clsx";

import {Choice} from "@core/elements/menu";
import {MenuElementProps} from "@player/elements/menu/type";
import ColoredSentence from "./Sentence";
import Say from "@player/elements/say/Say";
import Isolated from "@player/lib/isolated";
import {useGame} from "@player/provider/game-state";

export default function Menu({
                                 prompt,
                                 choices,
                                 afterChoose,
                             }: Readonly<MenuElementProps>) {
    const {game} = useGame();

    function choose(choice: Choice) {
        afterChoose(choice);
    }

    return (
        <>
            <Isolated className={"absolute"}>
                <div className="absolute flex flex-col items-center justify-center min-w-full w-full h-full">
                    {prompt && <Say action={{sentence: prompt, character: null}} useTypeEffect={false} className="z-10"/>}
                </div>
            </Isolated>
            <Isolated className={"absolute"}>
                <div className={clsx(
                    "absolute flex flex-col items-center justify-center min-w-full w-full h-full",
                    game.config.elementStyles.menu.container
                )}>
                    <div className="p-4 rounded-lg w-full z-20">
                        <div className="flex flex-col items-center mt-4 w-full">
                            {choices.map((choice, i) => (
                                <button key={i}
                                        className={clsx(
                                            "bg-white text-black p-2 rounded-lg mt-2 shadow-md w-1/2 hover:bg-gray-100 active:bg-gray-200 transition-colors",
                                            game.config.elementStyles.menu.choiceButton
                                        )}
                                        onClick={() => choose(choice)}>
                                    <ColoredSentence key={i} sentence={choice.prompt} className={clsx(
                                        game.config.elementStyles.menu.choiceButtonText
                                    )}/>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Isolated>
        </>
    );
};