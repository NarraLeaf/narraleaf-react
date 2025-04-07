import { Awaitable, EventDispatcher, SkipController } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { Timeline } from "../Tasks";
import { LiveGameEventToken } from "@lib/game/nlcore/types";

export type Notification = {
    message: string;
    id: string;
    duration: number;
}

export class NotificationArray {
    public static create(notifications: Notification[]): NotificationArray {
        const instance = new NotificationArray(notifications);

        return new Proxy(instance, {
            get(target, prop, receiver) {
                if (prop === "length") {
                    return target.notifications.length;
                }

                if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
                    return target.notifications[Number(prop)].message;
                }

                return Reflect.get(target, prop, receiver);
            }
        });
    }

    private readonly stringified: string[];
    private constructor(
        private readonly notifications: Notification[],
    ) {
        this.stringified = this.notifications.map(n => n.message);
    }

    private wrap<T>(
        callbackfn: (notification: string, id: string, array: string[]) => T
    ): (notification: Notification, index: number, array: Notification[]) => T {
        return (notification) => callbackfn(
            notification.message,
            notification.id,
            this.stringified
        );
    }

    /**
     * Map the notifications to a new array
     * 
     * **Note:** The callback function is called with the notification message, the **id** of the notification, and the array of notifications.
     * 
     * @param callbackfn - The callback function
     * @returns The new array
     */
    public map<U>(callbackfn: (notification: string, id: string, array: string[]) => U): U[] {
        return this.notifications.map(this.wrap(callbackfn));
    }

    public filter(callbackfn: (notification: string, id: string, array: string[]) => boolean): string[] {
        return this.notifications.filter(this.wrap(callbackfn)).map(n => n.message);
    }

    public forEach(callbackfn: (notification: string, id: string, array: string[]) => void): void {
        this.notifications.forEach(this.wrap(callbackfn));
    }

    public find(callbackfn: (notification: string, id: string, array: string[]) => boolean): string | undefined {
        return this.notifications.find(this.wrap(callbackfn))?.message;
    }

    public findIndex(callbackfn: (notification: string, id: string, array: string[]) => boolean): number {
        return this.notifications.findIndex(this.wrap(callbackfn));
    }
}

export class NotificationManager {
    private readonly events: EventDispatcher<{
        "event:notifications.flush": [];
    }> = new EventDispatcher();

    constructor(
        public gameState: GameState,
        public notifications: Notification[],
    ) {}
    
    public addNotification(notification: Notification) {
        this.notifications.push(notification);
    }
    
    public removeNotification(notification: Notification) {
        this.notifications = this.notifications.filter(n => n !== notification);
    }

    public clearNotifications() {
        this.notifications = [];
    }

    /**
     * Consume a notification
     * 
     * @param notification - The notification to consume
     * @returns A promise that resolves when the notification is consumed
     */
    public consume(notification: Notification): Awaitable<void> {
        const awaitable = new Awaitable<void>();
        const timeline = new Timeline(awaitable);

        awaitable.registerSkipController(new SkipController(() => {
            this.removeNotification(notification);
        }));
        this.gameState.schedule(() => {
            awaitable.resolve();
            this.removeNotification(notification);
        }, notification.duration);
        this.gameState.timelines.attachTimeline(timeline);

        return awaitable;
    }

    public onFlush(callback: () => void): LiveGameEventToken {
        return this.events.on("event:notifications.flush", callback);
    }

    public toArray(): Notification[] {
        return [...this.notifications];
    }

    private flush() {
        this.events.emit("event:notifications.flush");
    }
}
