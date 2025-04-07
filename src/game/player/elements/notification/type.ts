import { GameState } from "@lib/game/nlcore/common/game";
import React from "react";
export type Notification = {
    message: string;
    duration: number;
    id: string;
}

export type PlayerNotificationProps = {
    gameState: GameState;
};

export type NotificationsProps = {
    children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;
export type NotificationProps = React.PropsWithChildren<{
    notification: Notification;
}> & React.HTMLAttributes<HTMLDivElement>;
export interface INotificationsProps {
    notifications: Notification[];
}
