import React, { useMemo } from "react";
import clsx from "clsx";
import { IUserMenuProps, MenuElementProps } from "@player/elements/menu/type";
import Isolated from "@player/lib/isolated";
import { useGame } from "@player/provider/game-state";
import Inspect from "@player/lib/Inspect";
import { Chosen } from "@player/type";
import { Choice } from "@core/elements/menu";
import { Word } from "@core/elements/character/word";
import { Pausing } from "@core/elements/character/pause";
import { Script } from "@core/elements/script";
import { RawDialog } from "@lib/game/player/elements/say/Dialog";
import { UIMenuContext } from "./UIMenu/context";
import GameMenu from "./UIMenu/Menu";
import Item from "./UIMenu/Item";
import { RawTexts } from "../say/Sentence";

/**@internal */
export default function PlayerMenu(
    {
        prompt,
        choices,
        afterChoose,
        state,
        words,
    }: Readonly<MenuElementProps>) {
    const { game } = useGame();

    const MenuConstructor = game.config.menu;
    const evaluated: (Choice & { words: Word<Pausing | string>[] })[] =
        useMemo(
            () =>
                choices.map(choice => ({
                    ...choice,
                    words: choice.prompt.evaluate(Script.getCtx({ gameState: state }))
                })),
            []
        );

    function choose(choice: Chosen) {
        afterChoose(choice);
    }

    return (
        <>
            <UIMenuContext value={{ evaluated, choose, gameState: state }}>
                <Isolated className={"absolute"}>
                    {prompt && <RawDialog
                        gameState={state}
                        sentence={prompt}
                        words={words}
                        useTypeEffect={false}
                        className="z-10"
                    >
                        <RawTexts
                            gameState={state}
                            sentence={prompt}
                            words={words}
                            useTypeEffect={false}
                        />
                    </RawDialog>}
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
                    <MenuConstructor items={evaluated.map((_, i) => i)} />
                </Inspect.Div>
            </UIMenuContext>
        </>
    );
};

export function DefaultMenu({items}: IUserMenuProps) {
    return (
        <GameMenu
            className="absolute flex flex-col items-center justify-center min-w-full w-full h-full"
        >
            {items.map((index) => (
                <Item
                    key={index}
                    className="bg-white text-black p-2 mt-2 w-1/2"
                />
            ))}
        </GameMenu>
    );
}