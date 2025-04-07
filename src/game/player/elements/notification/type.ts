import { GameState } from "@player/gameState";
import React from "react";
import { NotificationArray } from "../../lib/notification";
export type Notification = {
    message: string;
    duration: number;
    id: string;
}

export type PlayerNotificationProps = {
    gameState: GameState;
};

export type NotificationsProps = {
} & React.PropsWithChildren<{}> & React.HTMLAttributes<HTMLDivElement>;
export type NotificationProps = {
    notification: Notification;
} & React.PropsWithChildren<{}> & React.HTMLAttributes<HTMLDivElement>;
export interface INotificationsProps {
    notifications: Notification[];
}
