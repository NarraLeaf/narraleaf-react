import React, { useMemo, useCallback, useRef } from "react";
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
import { UIMenuContext } from "./UIMenu/context";
import { UIListContext } from "./UIMenu/context";
import GameMenu from "./UIMenu/Menu";
import Item from "./UIMenu/Item";
import PlayerDialog from "../say/UIDialog";

/**@internal */
export default function PlayerMenu(
    {
        prompt,
        choices,
        afterChoose,
        state,
        words,
    }: Readonly<MenuElementProps>) {
    const game = useGame();
    const itemRefs = useRef<React.RefObject<HTMLElement>[]>([]);

    const register = useCallback((ref: React.RefObject<HTMLElement>) => {
        itemRefs.current.push(ref);
        return itemRefs.current.indexOf(ref);
    }, []);

    const unregister = useCallback((ref: React.RefObject<HTMLElement>) => {
        const index = itemRefs.current.indexOf(ref);
        if (index !== -1) {
            itemRefs.current.splice(index, 1);
        }
    }, []);

    const getIndex = useCallback((ref: React.RefObject<HTMLElement>) => {
        return itemRefs.current.indexOf(ref);
    }, []);

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
                <UIListContext value={{register, unregister, getIndex}}>
                    <Isolated className={"absolute"}>
                        {prompt && <PlayerDialog
                            gameState={state}
                            action={{
                                sentence: prompt,
                                words,
                                character: null,
                            }}
                            useTypeEffect={false}
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
                        <MenuConstructor items={evaluated.map((_, i) => i)} />
                    </Inspect.Div>
                </UIListContext>
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