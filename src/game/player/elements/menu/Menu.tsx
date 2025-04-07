import React, {useMemo} from "react";
import clsx from "clsx";
import {MenuElementProps} from "@player/elements/menu/type";
import Isolated from "@player/lib/isolated";
import {useGame} from "@player/provider/game-state";
import Sentence from "@player/elements/say/Sentence";
import Inspect from "@player/lib/Inspect";
import {useRatio} from "@player/provider/ratio";
import {Chosen} from "@player/type";
import {Choice} from "@core/elements/menu";
import {Word} from "@core/elements/character/word";
import {Pausing} from "@core/elements/character/pause";
import {Script} from "@core/elements/script";
import Say from "@player/elements/say/Say";

/**@internal */
export default function Menu(
    {
        prompt,
        choices,
        afterChoose,
        state,
        words,
    }: Readonly<MenuElementProps>) {
    const {game} = useGame();
    const {ratio} = useRatio();

    const evaluated: (Choice & { words: Word<Pausing | string>[] })[] =
        useMemo(
            () =>
                choices.map(choice => ({
                    ...choice,
                    words: choice.prompt.evaluate(Script.getCtx({gameState: state}))
                })),
            []
        );

    function choose(choice: Chosen) {
        afterChoose(choice);
    }

    return (
        <>
            <Isolated className={"absolute"}>
                {prompt && <Say
                    state={state}
                    action={{sentence: prompt, character: null, words}}
                    useTypeEffect={false}
                    className="z-10"
                />}
            </Isolated>
            <Inspect.Div
                color={"green"}
                border={"dashed"}
                className={clsx("absolute")}
                style={{
                    width: `${game.config.width}px`,
                    height: `${game.config.height}px`,
                }}
            >
                <Inspect.Div
                    tag={"menu.aspectScaleContainer"}
                    style={{
                        transform: `scale(${ratio.state.scale})`,
                        transformOrigin: "left top",
                    }}
                    className={clsx("w-full h-full")}
                >
                    <Inspect.Div
                        tag={"menu.containerClassName"}
                        className={clsx(
                            "absolute flex flex-col items-center justify-center min-w-full w-full h-full",
                            game.config.elementStyles.menu.containerClassName
                        )}
                    >
                        <div className="p-4 rounded-lg w-full z-20">
                            <div className="flex flex-col items-center mt-4 w-full">
                                {evaluated.map((choice, i) => (
                                    <Inspect.Button
                                        tag={"menu.choiceButtonClassName." + i}
                                        key={i}
                                        className={clsx(
                                            "bg-white text-black p-2 mt-2 w-1/2",
                                            game.config.elementStyles.menu.choiceButtonClassName
                                        )}
                                        onClick={() => choose({
                                            ...choice,
                                            evaluated: Word.getText(choice.words),
                                        })}
                                    >
                                        <Sentence
                                            sentence={choice.prompt}
                                            gameState={state}
                                            useTypeEffect={false}
                                            className={clsx(game.config.elementStyles.menu.choiceButtonTextClassName)}
                                            words={choice.words}
                                        />
                                    </Inspect.Button>
                                ))}
                            </div>
                        </div>
                    </Inspect.Div>
                </Inspect.Div>
            </Inspect.Div>
        </>
    );
};