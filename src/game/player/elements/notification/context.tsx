import { EmptyObject } from "@lib/game/nlcore/elements/transition/type";
import { Notification } from "./type";
import React from "react";

/* Notifications Context */
interface NotificationsContext {
    register: (ref: React.RefObject<EmptyObject>) => void;
    unregister: (ref: React.RefObject<EmptyObject>) => void;
    getNotification: (ref: React.RefObject<EmptyObject>) => Notification | null;
}

export const NotificationsContext = React.createContext<NotificationsContext | null>(null);

export function useNotificationsContext() {
    const context = React.useContext(NotificationsContext);
    if (!context) {
        throw new Error("useNotificationsContext must be used within a NotificationsContext");
    }
    return context;
}



