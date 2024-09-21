import React from "react";
import {SayElementProps} from "@player/elements/say/type";
import {MenuElementProps} from "@player/elements/menu/type";
import {Story} from "@core/elements/story";
import clsx from "clsx";
import {Game} from "@core/game";
import {GameState} from "@player/gameState";

export type Components<T extends Record<string, any>> = (props: Readonly<T>) => React.JSX.Element;
export type SayComponent = Components<SayElementProps>;
export type MenuComponent = Components<MenuElementProps>;
export type ComponentsTypes = {
    say: SayComponent;
    menu: MenuComponent;
};

export type {
    SayElementProps,
    MenuElementProps,
};

export type PlayerEventContext = {
    game: Game;
    state: GameState;
}

export interface PlayerProps {
    story: Story;
    width?: string | number;
    height?: string | number;
    className?: clsx.ClassValue;
    /**
     * Once the game is ready to be played
     *
     * only called once each lifecycle
     */
    onReady?: (ctx: PlayerEventContext) => void;
    /**
     * Once the game is ended
     *
     * only called once each lifecycle
     */
    onEnd?: (ctx: PlayerEventContext) => void;
}
