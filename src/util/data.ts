/**
 * @param obj1 source object
 * @param obj2 this object will overwrite the source object
 * @param objs
 * @example
 * deepMerge(defaultConfig, config);
 */
export function deepMerge<T = Record<string, any>>(obj1: Record<string, any>, obj2: Record<string, any>, ...objs: Record<string, any>[]): T {
    const hasOwnProperty = (obj: Record<string, any>, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
    const result: Record<string, any> = {};

    const mergeValue = (key: string, value1: any, value2: any) => {
        if (typeof value1 === 'object' && value1 !== null && !Array.isArray(value1) &&
            typeof value2 === 'object' && value2 !== null && !Array.isArray(value2)) {
            if (value1.constructor !== Object || value2.constructor !== Object) {
                return value2 || value1;
            }
            return deepMerge(value1, value2);
        } else if (Array.isArray(value1) && Array.isArray(value2)) {
            return value1.map((item, index) => {
                if (typeof item === 'object' && item !== null && !Array.isArray(item) && value2[index]) {
                    return deepMerge(item, value2[index]);
                }
                return item;
            });
        } else {
            return value2 !== undefined ? value2 : value1;
        }
    };

    for (const key in obj1) {
        if (hasOwnProperty(obj1, key)) {
            result[key] = mergeValue(key, obj1[key], obj2[key]);
        }
    }

    for (const key in obj2) {
        if (hasOwnProperty(obj2, key) && !hasOwnProperty(result, key)) {
            // If the value in obj2 is an object, perform a deep copy
            if (typeof obj2[key] === 'object' && obj2[key] !== null) {
                if (obj2[key].constructor !== Object) {
                    result[key] = obj2[key];
                } else {
                    result[key] = deepMerge({}, obj2[key]);
                }
            } else {
                result[key] = obj2[key];
            }
        }
    }

    if (objs.length) {
        const [next, ...rest] = objs;
        return deepMerge(result, next, ...rest);
    }

    return result as T;
}

export type DeepPartial<T> = {
    [P in keyof T]?: DeepPartial<T[P]>;
};

export class Awaitable<T, U = T> {
    receiver: (value: U) => T;
    result: T | undefined;
    solved = false;
    listeners: ((value: T) => void)[] = [];

    constructor(receiver: (value: U) => T = (value) => value as any) {
        this.receiver = receiver;
    }

    static isAwaitable(obj: any): obj is Awaitable<any, any> {
        return obj instanceof Awaitable;
    }

    resolve(value: U) {
        if (this.solved) {
            return;
        }
        this.result = this.receiver(value);
        this.solved = true;
        for (const listener of this.listeners) {
            listener(this.result);
        }
    }

    then(callback: (value: T) => void) {
        if (this.result) {
            callback(this.result);
        } else {
            this.listeners.push(callback);
        }
    }
}

export function safeClone<T>(obj: T): T {
    const seen = new WeakSet();

    function clone<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (seen.has(obj)) {
            return undefined as any;
        }

        seen.add(obj);

        if (Array.isArray(obj)) {
            const arrCopy = [] as any[];
            for (const item of obj) {
                arrCopy.push(clone(item));
            }
            return arrCopy as any;
        }

        const objCopy = {} as any;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                objCopy[key] = clone((obj as any)[key]);
            }
        }
        return objCopy;
    }

    return clone(obj);
}

export type Values<T> = T[keyof T];

export function toHex(hex: { r: number; g: number; b: number; a?: number } | string): string {
    if (typeof hex === 'string') {
        return hex;
    }
    return `#${(hex.r || 0).toString(16).padStart(2, '0')}${(hex.g || 0).toString(16).padStart(2, '0')}${(hex.b || 0).toString(16).padStart(2, '0')}${(hex.a !== undefined ? hex.a.toString(16).padStart(2, '0') : '')}`;
}

export type EventTypes = {
    [key: string]: any[];
}
export type EventListener<T extends any[]> = (...args: T) => void | Promise<any>;
export type EventToken = {
    type: keyof EventTypes;
    listener: EventListener<any>;
    cancel: () => void;
};

export class EventDispatcher<T extends EventTypes, Type extends T & {
    "event:EventDispatcher.register": [keyof EventTypes, EventListener<any>];
} = T & {
    "event:EventDispatcher.register": [keyof EventTypes, EventListener<any>];
}> {
    private events: { [K in keyof Type]: Array<(...args: any[]) => void> } = {} as any;

    public on<K extends keyof Type>(event: K, listener: EventListener<Type[K]>): EventListener<Type[K]> {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        this.emit("event:EventDispatcher.register", event as any, listener as any);
        return listener;
    }

    public onEvents(events: {
        type: keyof Type;
        listener: EventListener<Type[keyof Type]>;
    }[]): {
        tokens: EventToken[];
        cancel: () => void;
    } {
        const tokens = events.map(({type, listener}) => {
            return {
                type,
                listener,
                cancel: () => {
                    this.off(type, listener);
                }
            };
        }) as EventToken[];
        return {
            tokens,
            cancel: () => {
                tokens.forEach(token => token.cancel());
            }
        };
    }

    public off<K extends keyof Type>(event: K, listener: EventListener<Type[K]>): void {
        if (!this.events[event]) return;

        this.events[event] = this.events[event].filter(l => l !== listener);
    }

    public emit<K extends keyof Type>(event: K, ...args: Type[K]): void {
        if (!this.events[event]) return;

        this.events[event].forEach(listener => {
            listener(...args);
        });
    }

    public once<K extends keyof Type>(event: K, listener: EventListener<Type[K]>): EventListener<Type[K]> {
        const onceListener: EventListener<Type[K]> = (...args) => {
            listener(...args);
            this.off(event, onceListener);
        };
        return this.on(event, onceListener);
    }

    public async any<K extends keyof T>(event: K, ...args: T[K]): Promise<any> {
        if (!this.events[event]) {
            this.events[event] = [];
        }

        const promises = [];
        for (const listener of this.events[event]) {
            const result = listener(...args) as any;
            if (result && (typeof result === "object" && typeof result["then"] === "function")) {
                promises.push(result);
            }
        }
        this.events[event] = this.events[event].filter(l => !promises.includes(l));

        if (promises.length === 0) {
            return new Promise<void>((resolve) => {
                const type = "event:EventDispatcher.register";
                const listener = this.on(type, (type, fc) => {
                    if (type === event) {
                        this.off(type, listener);

                        let res = fc?.(...args);
                        if (res && res["then"]) {
                            res["then"](resolve);
                        } else {
                            resolve(res);
                        }
                    }
                });
            });
        }
        await Promise.all(promises);
        return void 0;
    }
}

/**
 * Get the call stack
 * @param n The number of stack frames to skip
 * @param s The number of stack frames cut off from the end
 */
export function getCallStack(n: number = 1, s: number = 0): string {
    const stack = new Error().stack;
    if (!stack) {
        return "";
    }
    // return stack.split('\n').slice(n + 1).join('\n').trim();
    return stack.split('\n').slice(n + 1, -s).join('\n').trim();
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
