import React from "react";
import { SayElementProps } from "@player/elements/say/type";
import { IUserMenuProps, MenuElementProps } from "@player/elements/menu/type";
import { Story } from "@core/elements/story";
import clsx from "clsx";
import { Game } from "@core/game";
import { GameState } from "@player/gameState";
import { Storable } from "@core/elements/persistent/storable";
import { LiveGame } from "@core/game/liveGame";
import { INotificationsProps, NotificationsProps } from "./notification/type";

export type Components<T extends Record<string, any>> = (props: Readonly<T>) => React.JSX.Element;
export type SayComponent = Components<SayElementProps>;
export type MenuComponent = Components<IUserMenuProps>;
export type NotificationComponent = Components<INotificationsProps>;
export type ComponentsTypes = {
    say: SayComponent;
    menu: MenuComponent;
    notification: NotificationComponent;
};

export type {
    SayElementProps,
    MenuElementProps,
    NotificationsProps as INotificationProps,
};

export type PlayerEventContext = {
    game: Game;
    gameState: GameState;
    liveGame: LiveGame;
    storable: Storable;
}

export interface PlayerProps {
    story?: Story;
    width?: string | number;
    height?: string | number;
    className?: clsx.ClassValue;
    /**
     * Once the game is ready to be played
     *
     * only called each lifecycle once
     */
    onReady?: (ctx: PlayerEventContext) => void;
    /**
     * Once the game is ended
     *
     * only called each lifecycle once
     */
    onEnd?: (ctx: PlayerEventContext) => void;
    children?: React.ReactNode;
    /**
     * Whether to show the player
     * 
     * Even the active is false, the pages will be rendered
     *
     * @default true
     */
    active?: boolean;
}
