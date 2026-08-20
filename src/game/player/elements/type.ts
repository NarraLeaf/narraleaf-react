import React, { ErrorInfo } from "react";
import { IDialogProps, SayElementProps } from "@player/elements/say/type";
import { IUserMenuProps, MenuElementProps } from "@player/elements/menu/type";
import { Story } from "@core/elements/story";
import type { ClassValue } from "clsx";
import { Game, type GameLifecycleEventContext } from "@core/game";
import { GameState } from "@player/gameState";
import { Storable } from "@core/elements/persistent/storable";
import { LiveGame } from "@core/game/liveGame";
import { INotificationsProps, NotificationsProps } from "./notification/type";
import { INvlContainerProps } from "./nvl/type";

export type Components<T extends Record<string, any>> = (props: Readonly<T>) => React.JSX.Element;
export type SayComponent = Components<IDialogProps>;
export type MenuComponent = Components<IUserMenuProps>;
export type NotificationComponent = Components<INotificationsProps>;
export type NvlDialogComponent = Components<INvlContainerProps>;
export type ComponentsTypes = {
    say: SayComponent;
    menu: MenuComponent;
    notification: NotificationComponent;
    nvlDialog: NvlDialogComponent;
};

export type {
    SayElementProps,
    MenuElementProps,
    NotificationsProps as INotificationProps,
};
export type { INvlContainerProps, NvlDialogItemRenderProps } from "./nvl/type";

export type PlayerEventContext = {
    game: Game;
    gameState: GameState;
    liveGame: LiveGame;
    storable: Storable;
}

export type PlayerLifecycleEventContext = GameLifecycleEventContext;

export interface PlayerProps {
    story?: Story;
    width?: string | number;
    height?: string | number;
    className?: ClassValue;
    /**
     * Once the Player is initialized.
     *
     * This is not a preload or first-render guarantee. Use
     * {@link PlayerProps.onPreloadComplete} or {@link PlayerProps.onFirstSceneReady}
     * when you need those exact lifecycle points.
     *
     * only called each lifecycle once
     */
    onReady?: (ctx: PlayerEventContext) => void;
    /**
     * Once the initial preload pass has actually completed.
     *
     * This fires before the first scene is guaranteed to be rendered.
     */
    onPreloadComplete?: (ctx: PlayerLifecycleEventContext) => void;
    /**
     * Once the internal preload pass is ready and the Player has committed that state.
     *
     * only called each lifecycle once
     *
     * @deprecated Use {@link PlayerProps.onPreloadComplete}.
     */
    onPreloadedReady?: (ctx: PlayerEventContext) => void;
    /**
     * Once the first scene has mounted and the browser has had a frame to render it.
     *
     * This is the most direct signal that the game is visually ready for the player.
     */
    onFirstSceneReady?: (ctx: PlayerLifecycleEventContext) => void;
    /**
     * Once the game is ended
     *
     * only called each lifecycle once
     */
    onEnd?: (ctx: PlayerEventContext) => void;
    /**
     * Once the game encounters an error
     *
     * only called each lifecycle once
     */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
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
