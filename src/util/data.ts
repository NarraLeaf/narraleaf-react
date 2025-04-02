import {HexColor, NamedColor} from "@core/types";

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

export class Awaitable<T = any, U = T> {
    static isAwaitable<T, U = T>(obj: any): obj is Awaitable<T, U> {
        return obj instanceof Awaitable;
    }

    static fromPromise<T>(promise: Promise<T>): Awaitable<T> {
        const awaitable = new Awaitable<T>();
        promise.then(value => awaitable.resolve(value));

        return awaitable;
    }

    static nothing: ((value: any) => any) = (value) => value as any;

    static resolve<T>(value: T): Awaitable<T> {
        const awaitable = new Awaitable<T>();
        awaitable.resolve(value);
        return awaitable;
    }

    static delay(ms: number): Awaitable<void> {
        const awaitable = new Awaitable<void>();
        setTimeout(() => awaitable.resolve(), ms);
        return awaitable;
    }

    /**
     * Creates a new `Awaitable<T>` that forwards resolution and cancellation from/to a source awaitable.
     *
     * This is useful when:
     * - You want to attach additional result transformation (e.g., `then → mapped result`)
     * - You want to expose a new awaitable while preserving skip/cancel propagation from both sides
     *
     * Behavior:
     * - When the source `awaitable` resolves, the new awaitable resolves with the provided `result`.
     * - If either the source or the new awaitable is aborted, the other is also aborted.
     *
     * @template T The result type of the new awaitable.
     *
     * @param {Awaitable<any>} awaitable
     *        The source awaitable whose completion or cancellation is being tracked.
     *
     * @param {T} result
     *        The result to resolve the new awaitable with, once the source awaitable completes.
     *
     * @param {SkipController<T>} [skipController]
     *        Optional custom skip controller for the new awaitable.
     *        If not provided, a default controller that returns `result` will be created.
     *
     * @returns {Awaitable<T>} A new awaitable that resolves with `result` and mirrors skip behavior.
     */
    static forward<T>(awaitable: Awaitable<any>, result: T, skipController?: SkipController<T, []>) {
        const newAwaitable = new Awaitable<T>()
            .registerSkipController(skipController || new SkipController(() => result));
        awaitable.then(() => newAwaitable.resolve(result));

        const skipControllerToken = awaitable.skipController?.onAbort(() => {
            newAwaitable.skipController?.abort();
            skipControllerToken?.cancel();
            newSkipControllerToken?.cancel();
        });
        const newSkipControllerToken = newAwaitable.skipController?.onAbort(() => {
            awaitable.skipController?.abort();
            skipControllerToken?.cancel();
            newSkipControllerToken?.cancel();
        });

        return newAwaitable;
    }

    receiver: (value: U) => T;
    result: T | undefined;
    solved = false;
    skipController: SkipController<T, []> | undefined;
    private readonly listeners: ((value: T) => void)[] = [];
    private readonly onRegisterSkipController: ((skipController: SkipController<T, []>) => void)[] = [];
    private readonly __stack?: string;

    constructor(
        receiver: (value: U) => T = ((value) => value as any),
        skipController?: SkipController<T, []>
    ) {
        this.receiver = receiver;
        this.skipController = skipController;
        this.__stack = getCallStack();
    }

    registerSkipController(skipController: SkipController<T, []>) {
        this.skipController = skipController;
        for (const listener of this.onRegisterSkipController) {
            listener(skipController);
        }

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

    then(callback: (value: T) => void): this {
        if (this.solved) {
            callback(this.result!);
        } else {
            this.listeners.push(callback);
        }
        return this;
    }

    onSettled(callback: () => void): this {
        if (this.solved) {
            callback();
        } else {
            this.listeners.push(callback);
            this.onSkipControllerRegister((controller) => {
                controller.onAbort(() => {
                    callback();
                });
            });
        }
        return this;
    }

    onSkipControllerRegister(callback: (skipController: SkipController<T, []>) => void) {
        if (this.skipController) {
            callback(this.skipController);
        } else {
            this.onRegisterSkipController.push(callback);
        }
        return this;
    }

    /**
     * **Note**: Calling this method won't trigger the `then` or `onSettled` callbacks.
     */
    abort() {
        if (this.skipController) {
            return this.skipController.abort();
        }
        return this.result;
    }

    isSolved() {
        return this.solved;
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
export type EventListener<T extends any[]> = (...args: T) => void | Thenable<any>;
export type EventToken<T extends EventTypes = EventTypes> = {
    type?: keyof T;
    listener?: EventListener<any>;
    cancel: () => void;
};

export class EventDispatcher<T extends EventTypes, Type extends T & {
    "event:EventDispatcher.register": [keyof EventTypes, EventListener<any>];
} = T & {
    "event:EventDispatcher.register": [keyof EventTypes, EventListener<any>];
}> {
    private events: { [K in keyof Type]: Array<EventListener<Type[K]>> } = {} as any;
    private maxListeners = 10;

    public on<K extends StringKeyOf<Type>>(event: K, listener: EventListener<Type[K]>): EventToken {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        if (this.events[event].length > this.maxListeners) {
            console.warn(`NarraLeaf-React: Event ${event} has more than ${this.maxListeners} listeners (total: ${this.events[event].length}), this may cause performance issues.`);
        }

        this.emit("event:EventDispatcher.register", event as any, listener as any);
        return {
            type: event,
            listener,
            cancel: () => {
                this.off(event, listener);
            }
        };
    }

    public depends(events: EventToken<T>[]): EventToken {
        return {
            cancel: () => {
                events.forEach(token => token.cancel());
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

    public once<K extends StringKeyOf<Type>>(event: K, listener: EventListener<Type[K]>): EventToken {
        const onceListener: EventListener<Type[K]> = (...args) => {
            listener(...args);
            this.off(event, onceListener);
        };
        return this.on(event, onceListener);
    }

    /**
     * Emit an event and wait for all listeners to resolve.
     * If there's no listener, wait until a listener is registered and solved
     */
    public async any<K extends keyof T>(event: K, ...args: Type[K]): Promise<any> {
        if (!this.events[event]) {
            this.events[event] = [];
        }

        // If there is any registered listener
        if (this.events[event].length > 0) {
            await Promise.all(this.events[event].map(listener => listener(...args)));
            return;
        }

        // If there's no registered listener
        return new Promise<void>((resolve) => {
            const registerType = "event:EventDispatcher.register" as any;
            const listener = this.on(registerType, (type, fc) => {
                if (type === event) {
                    this.off(registerType, listener);

                    const res = fc?.(...args);
                    if (res !== null && typeof res === "object" && res["then"]) {
                        res["then"](resolve);
                    } else {
                        resolve(res);
                    }
                }
            }).listener!;
        });
    }

    public setMaxListeners(maxListeners: number): this {
        this.maxListeners = maxListeners;
        return this;
    }

    clear() {
        this.events = {} as any;
    }
}

/**
 * Get the call stack
 * @param n The number of stack frames to skip
 */
export function getCallStack(n: number = 1): string {
    const stack = new Error().stack;
    if (!stack) {
        return "";
    }
    return stack.split("\n").slice(n + 1).join("\n").trim();
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

export class SkipController<_T = any, U extends Array<any> = any[]> {
    static EventTypes: { [K in keyof SkipControllerEvents]: K } = {
        "event:skipController.abort": "event:skipController.abort",
    };
    public readonly events: EventDispatcher<SkipControllerEvents> = new EventDispatcher();
    private aborted = false;

    constructor(private readonly abortHandler: (...args: U) => void) {
    };

    public abort(...args: U): void {
        if (this.aborted) {
            return;
        }
        this.aborted = true;
        this.abortHandler(...args);
        this.events.emit(SkipController.EventTypes["event:skipController.abort"]);
    }

    public isAborted() {
        return this.aborted;
    }

    public cancel() {
        this.aborted = true;
    }

    public onAbort(listener: () => void) {
        return this.events.on("event:skipController.abort", listener);
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

    public lock(): this {
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
    if (delay <= 0) {
        return fn;
    }

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
    return new Promise<string>((resolve, reject) => {
        fetch(src, options)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onload = () => {
                    resolve(reader.result as string);
                };
                reader.readAsDataURL(blob);
            })
            .catch(reject);
    });
}

export class TaskPool {
    private tasks: (() => Promise<void>)[] = [];

    constructor(private readonly concurrency: number, private readonly delay: number) {
    }

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

export type StringKeyOf<T> = Extract<keyof T, string>;
export type ValuesWithin<T, U> = {
    [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];
export type BooleanValueKeyOf<T> = Extract<{
    [K in keyof T]: T[K] extends boolean ? K : never;
}[keyof T], string>;

export function createMicroTask(t: () => (() => void) | void): () => void {
    let cleanupFn: (() => void) | void;

    const task = Promise.resolve().then(() => {
        cleanupFn = t();
    });

    return () => {
        task.then(() => {
            if (cleanupFn) {
                cleanupFn();
            }
        });
    };
}

export function keyExcept<T extends Record<string, any>, Filtered extends Extract<keyof T, string>>(
    obj: T,
    keys: Filtered[]
): Omit<T, Filtered> {
    const result: Record<string, any> = {};
    for (const key in obj) {
        if (keys.includes(key as Filtered)) {
            continue;
        }
        result[key] = obj[key];
    }
    return result as Omit<T, Filtered>;
}

type SerializeHandlers<T> = {
    [K in keyof T]?: (value: Exclude<T[K], undefined>) => any;
};
type DeserializeHandlers<T, SerializeHandler extends SerializeHandlers<T>> = {
    [K in keyof T]?: SerializeHandler[K] extends ((...args: any) => any)
        ? (value: Exclude<ReturnType<SerializeHandler[K]>, undefined>) => T[K]
        : never;
}

export class Serializer<
    T extends Record<string, any>,
    SerializeHandler extends SerializeHandlers<T> = SerializeHandlers<T>,
    DeserializeHandler extends DeserializeHandlers<T, SerializeHandler> = DeserializeHandlers<T, SerializeHandler>
> {
    constructor(
        private readonly serializer: SerializeHandler = {} as SerializeHandler,
        private readonly deserializer: DeserializeHandler = {} as DeserializeHandler,
    ) {
    }

    serialize(obj: T): Record<string, any> {
        const result: Record<keyof T, any> = {} as any;
        for (const key of Object.keys(obj) as Array<keyof T>) {
            if (key in this.serializer && obj[key] !== undefined) {
                result[key] = this.serializer[key]?.(obj[key]);
            } else {
                result[key] = obj[key];
            }
        }
        return result;
    }

    deserialize(obj: Record<string, any>): T {
        const result = {} as T;
        for (const key of Object.keys(obj) as Array<Extract<keyof T, string>>) {
            if (typeof this.deserializer[key] === "function" && obj[key] !== undefined) {
                result[key as keyof T] = this.deserializer[key]!(obj[key]);
            } else {
                result[key] = obj[key];
            }
        }
        return result;
    }

    extend<
        NewFields extends Record<string, any>,
        NewSerializeHandler extends SerializeHandlers<T & NewFields>,
        NewDeserializeHandler extends DeserializeHandlers<T & NewFields, NewSerializeHandler>
    >(
        newSerializer: NewSerializeHandler,
        newDeserializer: NewDeserializeHandler
    ): Serializer<T & NewFields, SerializeHandler & NewSerializeHandler, DeserializeHandler & NewDeserializeHandler> {
        const extendedSerializer = {...this.serializer, ...newSerializer} as SerializeHandler & NewSerializeHandler;
        const extendedDeserializer = {...this.deserializer, ...newDeserializer} as DeserializeHandler & NewDeserializeHandler;

        return new Serializer(extendedSerializer, extendedDeserializer);
    }
}

export function isNamedColor(color: string): color is NamedColor {
    return [
        "aliceblue"
        , "antiquewhite"
        , "aqua"
        , "aquamarine"
        , "azure"
        , "beige"
        , "bisque"
        , "black"
        , "blanchedalmond"
        , "blue"
        , "blueviolet"
        , "brown"
        , "burlywood"
        , "cadetblue"
        , "chartreuse"
        , "chocolate"
        , "coral"
        , "cornflowerblue"
        , "cornsilk"
        , "crimson"
        , "cyan"
        , "darkblue"
        , "darkcyan"
        , "darkgoldenrod"
        , "darkgray"
        , "darkgreen"
        , "darkgrey"
        , "darkkhaki"
        , "darkmagenta"
        , "darkolivegreen"
        , "darkorange"
        , "darkorchid"
        , "darkred"
        , "darksalmon"
        , "darkseagreen"
        , "darkslateblue"
        , "darkslategray"
        , "darkslategrey"
        , "darkturquoise"
        , "darkviolet"
        , "deeppink"
        , "deepskyblue"
        , "dimgray"
        , "dimgrey"
        , "dodgerblue"
        , "firebrick"
        , "floralwhite"
        , "forestgreen"
        , "fuchsia"
        , "gainsboro"
        , "ghostwhite"
        , "gold"
        , "goldenrod"
        , "gray"
        , "green"
        , "greenyellow"
        , "grey"
        , "honeydew"
        , "hotpink"
        , "indianred"
        , "indigo"
        , "ivory"
        , "khaki"
        , "lavender"
        , "lavenderblush"
        , "lawngreen"
        , "lemonchiffon"
        , "lightblue"
        , "lightcoral"
        , "lightcyan"
        , "lightgoldenrodyellow"
        , "lightgray"
        , "lightgreen"
        , "lightgrey"
        , "lightpink"
        , "lightsalmon"
        , "lightseagreen"
        , "lightskyblue"
        , "lightslategray"
        , "lightslategrey"
        , "lightsteelblue"
        , "lightyellow"
        , "lime"
        , "limegreen"
        , "linen"
        , "magenta"
        , "maroon"
        , "mediumaquamarine"
        , "mediumblue"
        , "mediumorchid"
        , "mediumpurple"
        , "mediumseagreen"
        , "mediumslateblue"
        , "mediumspringgreen"
        , "mediumturquoise"
        , "mediumvioletred"
        , "midnightblue"
        , "mintcream"
        , "mistyrose"
        , "moccasin"
        , "navajowhite"
        , "navy"
        , "oldlace"
        , "olive"
        , "olivedrab"
        , "orange"
        , "orangered"
        , "orchid"
        , "palegoldenrod"
        , "palegreen"
        , "paleturquoise"
        , "palevioletred"
        , "papayawhip"
        , "peachpuff"
        , "peru"
        , "pink"
        , "plum"
        , "powderblue"
        , "purple"
        , "rebeccapurple"
        , "red"
        , "rosybrown"
        , "royalblue"
        , "saddlebrown"
        , "salmon"
        , "sandybrown"
        , "seagreen"
        , "seashell"
        , "sienna"
        , "silver"
        , "skyblue"
        , "slateblue"
        , "slategray"
        , "slategrey"
        , "snow"
        , "springgreen"
        , "steelblue"
        , "tan"
        , "teal"
        , "thistle"
        , "tomato"
        , "transparent"
        , "turquoise"
        , "violet"
        , "wheat"
        , "white"
        , "whitesmoke"
        , "yellow"
        , "yellowgreen"
    ].includes(color);
}

type ChainedAwaitableTaskHandler = (awaitable: Awaitable<void>) => void;
export type ChainedAwaitableTask = [ChainedAwaitableTaskHandler, SkipController<void, []>?];

export class ChainedAwaitable extends Awaitable<void, void> {
    private current: Awaitable<void> | undefined;
    private tasks: ChainedAwaitableTask[] = [];

    constructor(skipController?: SkipController<void, []>) {
        super();
        if (skipController) this.registerSkipController(skipController);
    }

    addTask(task?: [handler: ChainedAwaitableTaskHandler, skipController?: SkipController<void, []>]): this {
        if (!task) {
            return this;
        }
        this.tasks.push(task);
        return this;
    }

    override abort(): void {
        if (this.current) this.current.abort();
        this.tasks.forEach(([_, skipController]) => {
            if (skipController) skipController.abort();
        });
        super.abort();
        return void 0;
    }

    override resolve(): void {
        return void 0;
    }

    public run(): this {
        if (this.current) {
            return this;
        }
        this.onTaskComplete();
        return this;
    }

    private onTaskComplete(): void {
        if (this.tasks.length === 0) {
            super.resolve();
            return;
        }
        const [handler, skipController] = this.tasks.shift()!;
        const awaitable = new Awaitable<void, void>(Awaitable.nothing, skipController);
        this.current = awaitable;
        this.current.then(() => this.onTaskComplete());

        handler(awaitable);
    }
}

export function isAsyncFunction<T extends Array<any>, U = void>(fn: (...args: T) => U | Promise<U>): fn is (...args: T) => Promise<U> {
    return fn.constructor.name === "AsyncFunction" || Object.prototype.toString.call(fn) === "[object AsyncFunction]";
}

export type SerializableDataType = number | string | boolean | null | undefined | SerializableDataType[];
export type SerializableData = Record<string, SerializableDataType> | SerializableDataType;
export type Thenable<T> = T | Promise<T> | Awaitable<T>;

export function ThenableAll(thenables: Thenable<any>[]): Promise<any[]> {
    return Promise.all(thenables.map(thenable => {
        if (thenable instanceof Awaitable) {
            return new Promise(resolve => {
                thenable.then(resolve);
            });
        }
        return thenable;
    }));
}

export function onlyValidFields<T extends Record<string, any>>(obj: T): T {
    const result: T = {} as T;
    for (const key in obj) {
        if (obj[key] !== undefined) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Check if the object is a pure object
 *
 * A pure object should:
 * - be an object (prototype is Object)
 * - not be an array
 * - no circular reference
 * - sub objects should also be pure objects or serializable data
 */
export function isPureObject(obj: any, seen: WeakSet<any> = new WeakSet()): boolean {
    // Check if obj is null or not an object
    if (obj === null || typeof obj !== "object") {
        return false;
    }

    // Ensure obj isn't an array, Date, or RegExp
    if (Array.isArray(obj) || obj instanceof Date || obj instanceof RegExp) {
        return false;
    }

    // Ensure the prototype is Object.prototype
    if (Object.getPrototypeOf(obj) !== Object.prototype) {
        return false;
    }

    // Check for circular references
    if (seen.has(obj)) {
        return false; // Circular reference detected
    }
    seen.add(obj);

    // Recursively check all properties of the object
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            // Ensure all sub-objects are pure or serializable
            if (
                value !== null &&
                typeof value === "object" &&
                !isPureObject(value, seen)
            ) {
                return false;
            }
            // Ensure non-serializable types are not present
            if (typeof value === "function" || typeof value === "symbol") {
                return false;
            }
        }
    }

    // Passed all checks
    return true;
}

export class KeyGen {
    private counter = 0;

    constructor(private prefix: string = "") {
    }

    next() {
        return `${this.prefix ? this.prefix + "-" : ""}${this.counter++}`;
    }
}

export function once<T extends (...args: any[]) => any>(fn: T): T {
    let called = false;
    return function (...args: T extends ((...args: infer P) => any) ? P : never[]) {
        if (called) {
            return;
        }
        called = true;
        return fn(...args);
    } as T;
}

export function randId(len: number = 16): string {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;
    for (let i = 0; i < len; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export function generateId(length: number = 16): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

export const voidFunction: () => VoidFunction = () => {
    return () => {};
};
