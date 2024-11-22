import {HexColor} from "@core/types";

interface ITypeOf {
    DataTypes: typeof DataTypes;
    call: typeof TypeOf;

    (value: any): DataTypes;
}

export enum DataTypes {
    "string",
    "number",
    "boolean",
    "object",
    "array",
    "function",
    "symbol",
    "undefined",
    "null",
    "date",
    "regexp",
    "other",
}

export const TypeOf = (function (value: any): DataTypes {
    if (typeof value === "string") {
        return DataTypes.string;
    }
    if (typeof value === "number") {
        return DataTypes.number;
    }
    if (typeof value === "boolean") {
        return DataTypes.boolean;
    }
    if (typeof value === "object") {
        if (Array.isArray(value)) {
            return DataTypes.array;
        }
        if (value === null) {
            return DataTypes.null;
        }
        if (value instanceof Date) {
            return DataTypes.date;
        }
        if (value instanceof RegExp) {
            return DataTypes.regexp;
        }
        return DataTypes.object;
    }
    if (typeof value === "function") {
        return DataTypes.function;
    }
    if (typeof value === "symbol") {
        return DataTypes.symbol;
    }
    if (typeof value === "undefined") {
        return DataTypes.undefined;
    }
    return DataTypes.other;
}) as unknown as ITypeOf;

TypeOf.DataTypes = DataTypes;

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

    const mergeValue = (_: string, value1: any, value2: any) => {
        if (TypeOf(value1) === DataTypes.object && TypeOf(value2) === DataTypes.object) {
            if (value1.constructor !== Object || value2.constructor !== Object) {
                return value2 || value1;
            }
            return deepMerge(value1, value2);
        } else if (Array.isArray(value1) && Array.isArray(value2)) {
            if (value2 && value2.length > 0) {
                return [...value2];
            }
            return [...value1];
        } else if (value1 === undefined && Array.isArray(value2)) {
            return [...value2];
        } else {
            return value2 === undefined ? (
                Array.isArray(value1) ? [...value1] : value1
            ) : (
                Array.isArray(value2) ? [...value2] : value2
            );
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
            if (typeof obj2[key] === "object" && obj2[key] !== null) {
                if (obj2[key].constructor === Object) {
                    result[key] = deepMerge({}, obj2[key]);
                } else if (Array.isArray(obj2[key])) {
                    result[key] = [...obj2[key]];
                } else {
                    result[key] = obj2[key];
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

export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

export class Awaitable<T, U = T> {
    static isAwaitable<T, U = T>(obj: any): obj is Awaitable<T, U> {
        return obj instanceof Awaitable;
    }

    static nothing: ((value: any) => any) = (value) => value as any;

    receiver: (value: U) => T;
    result: T | undefined;
    solved = false;
    private readonly listeners: ((value: T) => void)[] = [];
    private skipController: SkipController<T, []> | undefined;

    constructor(
        receiver: (value: U) => T = ((value) => value as any),
        skipController?: SkipController<T, []>
    ) {
        this.receiver = receiver;
        this.skipController = skipController;
    }

    registerSkipController(skipController: SkipController<T, []>) {
        this.skipController = skipController;
        return this;
    }

    resolve(value: U) {
        if (this.solved) {
            return;
        }
        this.result = this.receiver(value);
        this.solved = true;
        if (this.skipController) {
            this.skipController.cancel();
        }

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

    abort() {
        if (this.skipController) {
            return this.skipController.abort();
        }
        return this.result;
    }
}

export function safeClone<T>(obj: T): T {
    const seen = new WeakSet();

    function clone<T>(obj: T): T {
        if (obj === null || typeof obj !== "object") {
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
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                objCopy[key] = clone((obj as any)[key]);
            }
        }
        return objCopy;
    }

    return clone(obj);
}

export type Values<T> = T[keyof T];

export function toHex(hex: { r: number; g: number; b: number; a?: number } | string): HexColor {
    if (typeof hex === "string") {
        return hex as HexColor;
    }
    return `#${(hex.r || 0).toString(16).padStart(2, "0")}${(hex.g || 0).toString(16).padStart(2, "0")}${(hex.b || 0).toString(16).padStart(2, "0")}${(hex.a === undefined ? "" : hex.a.toString(16).padStart(2, "0"))}`;
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
    private events: { [K in keyof Type]: Array<EventListener<Type[K]>> } = {} as any;

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
        listener: EventListener<any>;
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

    public async any<K extends keyof T>(event: K, ...args: Type[K]): Promise<any> {
        if (!this.events[event]) {
            this.events[event] = [];
        }

        const promises: any[] = [];
        let solved = false;
        for (const listener of this.events[event]) {
            const result = listener(...args) as any;
            if (result && (typeof result === "object" && typeof result["then"] === "function")) {
                promises.push(result);
            } else {
                solved = true;
            }
        }
        if (solved) {
            return void 0;
        }
        this.events[event] = this.events[event].filter(l => !promises.includes(l));

        if (promises.length === 0) {
            return new Promise<void>((resolve) => {
                const type = "event:EventDispatcher.register";
                const listener = this.on(type, (type, fc) => {
                    if (type === event) {
                        this.off((type as "event:EventDispatcher.register"), listener);

                        const res = fc?.(...args);
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

    clear() {
        this.events = {} as any;
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
    return stack.split("\n").slice(n + 1, -s).join("\n").trim();
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 === null || obj2 === null) return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
}

type SkipControllerEvents = {
    "event:skipController.abort": [];
}

export class SkipController<T = any, U extends Array<any> = any[]> {
    static EventTypes: { [K in keyof SkipControllerEvents]: K } = {
        "event:skipController.abort": "event:skipController.abort",
    };
    public readonly events: EventDispatcher<SkipControllerEvents> = new EventDispatcher();
    private aborted = false;
    private result: T | undefined;

    constructor(private readonly abortHandler: (...args: U) => T) {
    };

    public abort(...args: U) {
        if (this.aborted) {
            return this.result;
        }
        this.aborted = true;
        this.result = this.abortHandler(...args);
        return this.result;
    }

    public isAborted() {
        return this.aborted;
    }

    public cancel() {
        this.aborted = true;
    }
}

export function throttle<T extends (...args: any[]) => any>(fn: T, delay: number): T {
    let last = 0;
    return function (...args: T extends ((...args: infer P) => any) ? P : never[]) {
        const now = Date.now();
        if (now - last < delay) {
            return;
        }
        last = now;
        return fn(...args);
    } as T;
}

export type PublicProperties<T> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];
export type PublicOnly<T> = Pick<T, PublicProperties<T>>;

export class Lock {
    private locked = false;
    private listeners: (() => void)[] = [];
    private unlockListeners: (() => void)[] = [];

    public lock() {
        this.locked = true;
        return this;
    }

    public unlock() {
        this.locked = false;
        for (const listener of this.listeners) {
            listener();
        }
        for (const listener of this.unlockListeners) {
            listener();
        }
        this.listeners = [];
        return this;
    }

    public onUnlock(listener: () => void) {
        this.unlockListeners.push(listener);
        return listener;
    }

    public offUnlock(listener: () => void) {
        this.unlockListeners = this.unlockListeners.filter(l => l !== listener);
    }

    public async nextUnlock() {
        if (!this.locked) {
            return;
        }
        return new Promise<void>(resolve => {
            this.listeners.push(resolve);
        });
    }

    public isLocked() {
        return this.locked;
    }
}

export class MultiLock {
    private locks: Lock[] = [];

    public unlock(lock: Lock): Lock {
        lock.unlock();
        this.off(lock);
        return lock;
    }

    public register(lock?: Lock): Lock {
        const targetLock = lock || new Lock();
        this.locks.push(targetLock);
        return targetLock;
    }

    public off(lock: Lock) {
        this.locks = this.locks.filter(l => l !== lock);
    }

    public async nextUnlock() {
        const promises = this.locks.map(lock => lock.nextUnlock());
        return Promise.all(promises);
    }

    public isLocked() {
        return this.locks.some(lock => lock.isLocked());
    }
}

export function onlyIf<T>(condition: boolean, value: T, fallback: object = {}): T | object {
    return condition ? value : fallback;
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
    let timer: NodeJS.Timeout | null = null;
    return function (...args: T extends ((...args: infer P) => any) ? P : never[]) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            fn(...args);
        }, delay);
    } as T;
}

export function entriesForEach<T extends object, V = undefined>(
    obj: T,
    handler: { [K in keyof T]: (value: Exclude<T[K], V>, key: K) => void },
    validate: (value: any, key: string) => boolean = (v) => v !== undefined
): void {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && key in handler && validate(obj[key], key)) {
            handler[key as keyof T](obj[key] as Exclude<T[keyof T], V>, key as keyof T);
        }
    }
}

type ScheduleTaskToken = {
    cancel: () => void;
    isCancelled: () => boolean;
};

export class Scheduler {
    private taskToken: ScheduleTaskToken | null = null;

    scheduleTask(handler: () => void, delay: number): ScheduleTaskToken {
        if (this.taskToken) {
            this.taskToken.cancel();
        }

        let cancelled = false;
        const timeoutId = setTimeout(() => {
            if (!cancelled) {
                handler();
            }
        }, delay);

        this.taskToken = {
            cancel: () => {
                clearTimeout(timeoutId);
                cancelled = true;
            },
            isCancelled: () => cancelled,
        };

        return this.taskToken!;
    }

    cancelTask() {
        if (this.taskToken) {
            this.taskToken.cancel();
            this.taskToken = null;
        }
        return this;
    }
}

/**
 * Cross combine two arrays
 * @example
 * ```typescript
 * crossCombine([1, 2], ["a", "b"]); // [1, "a", 2, "b"]
 * ```
 */
export function crossCombine<T, U>(a: T[], b: U[]): (T | U)[] {
    const result: (T | U)[] = [];

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i < a.length) {
            result.push(a[i]);
        }
        if (i < b.length) {
            result.push(b[i]);
        }
    }
    return result;
}

export type SelectElementFromEach<T extends string[][] | null> =
    T extends [infer First, ...infer Rest]
        ? First extends string[]
            ? Rest extends string[][]
                ? {
                    [K in First[number]]: [K, ...SelectElementFromEach<ExcludeEach<Rest, K>>];
                }[First[number]]
                : []
            : []
        : [];
export type ExcludeEach<T extends string[][], Excluded> =
    T extends [infer First, ...infer Rest]
        ? First extends string[]
            ? Rest extends string[][]
                ? [[Exclude<First[number], Excluded>], ...ExcludeEach<Rest, Excluded>]
                : []
            : []
        : [];
export type FlexibleTuple<T extends any[]> =
    T extends [infer First, ...infer Rest]
        ? Rest extends any[]
            ? [First, ...FlexibleTuple<Rest>] | FlexibleTuple<Rest>
            : [First]
        : [];

export function moveElement<T>(arr: T[], element: T, direction: "up" | "down" | "top" | "bottom"): T[] {
    const index = arr.indexOf(element);
    if (index === -1) return arr;

    const result = [...arr];
    result.splice(index, 1);

    switch (direction) {
        case "up":
            result.splice(Math.max(index - 1, 0), 0, element);
            break;
        case "down":
            result.splice(Math.min(index + 1, arr.length), 0, element);
            break;
        case "top":
            result.unshift(element);
            break;
        case "bottom":
            result.push(element);
            break;
    }

    return result;
}

export function moveElementInArray<T>(arr: T[], element: T, newIndex: number): T[] {
    const index = arr.indexOf(element);
    if (index === -1) return arr;

    const result = [...arr];
    result.splice(index, 1);
    result.splice(newIndex, 0, element);

    return result;
}

export async function getImageDataUrl(src: string, options?: RequestInit): Promise<string> {
    const response = await fetch(src, options);
    const blob = await response.blob();
    return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result as string);
        };
        reader.readAsDataURL(blob);
    });
}

export class TaskPool {
    private tasks: (() => Promise<void>)[] = [];

    constructor(private readonly concurrency: number, private readonly delay: number) {}

    addTask(task: () => Promise<void>) {
        this.tasks.push(task);
    }

    async start(): Promise<void> {
        const run = async () => {
            if (this.tasks.length === 0) {
                return;
            }
            const tasks = this.tasks.splice(0, this.concurrency);
            await Promise.all(tasks.map(task => task()));
            await sleep(this.delay);
            await run();
        };
        await run();
    }
}
