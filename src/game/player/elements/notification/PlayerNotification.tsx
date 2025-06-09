import React, { useEffect } from "react";
import { useFlush } from "../../lib/flush";
import { PlayerNotificationProps, INotificationsProps } from "./type";
import Notifications from "./Notifications";
import { useRatio } from "../../provider/ratio";

export default function PlayerNotification({ gameState }: PlayerNotificationProps) {
    const [flush] = useFlush();
    const {ratio} = useRatio();
    const manager = gameState.notificationMgr;

    useEffect(() => {
        return manager.onFlush(() => {
            flush();
        }).cancel;
    }, []);

    const NotificationConstructor = gameState.game.config.notification;

    return (
        <div
            style={{
                transform: `scale(${ratio.state.scale})`,
                transformOrigin: "left top",
            }}
            className="absolute top-0 left-0 w-full h-full pointer-events-none" data-element-type="notification">
            <NotificationConstructor notifications={manager.toArray()} />
        </div>
    );
}

export function DefaultNotification({ notifications }: INotificationsProps) {
    return (
        <Notifications
            className="absolute top-0 left-0 w-full h-full"
        >
            {notifications.map(({id, message}) =>
                <div
                    key={id}
                    className="absolute top-0 left-0 w-[100px] h-[80px]"
                >
                    <span className="text-white text-2xl font-bold">
                        {message}
                    </span>
                </div>
            )}
        </Notifications>
    );
}
