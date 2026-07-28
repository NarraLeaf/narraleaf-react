import {
    BaseStorableDeserializeHandlers,
    BaseStorableSerializeHandlers,
    BaseStorableTypeName,
    NameSpaceContent,
    SerializedNamespaceData,
    StorableType,
    WrappedStorableData
} from "@core/elements/persistent/type";
import {deepMerge, EventDispatcher, EventToken} from "@lib/util/data";
import {RuntimeGameError} from "@core/common/Utils";

/**
 * One stored value changing. Reported by {@link Storable.onChange} after the new value is
 * already readable through `getNamespace(namespace).get(key)`.
 */
export type StorableChange<T extends StorableType = any> = {
    /**
     * The key the namespace is registered under in the {@link Storable} — the same string
     * {@link Storable.getNamespace} takes, and the one a save file carries. For a namespace
     * declared with `new Persistent("player", ...)` this is `"persistent:player"`.
     */
    namespace: string;
    key: string;
    /** The value that was there. `undefined` if the key had never been written. */
    previous: T | undefined;
    /** The value that is there now. `undefined` if the key was dropped (see {@link Namespace.reset}). */
    next: T | undefined;
};

/**
 * A bulk value application — a save being loaded, or a namespace being rewound to a
 * snapshot. Reported by {@link Storable.onRestore} *instead of* per-key changes; see the
 * note on {@link Namespace.deserialize}.
 */
export type StorableRestore = {
    /** The namespace keys whose contents were replaced. */
    namespaces: string[];
};

export type StorableEvents = {
    "event:storable.change": [StorableChange];
    "event:storable.restore": [StorableRestore];
};

/**@internal */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Whether a write leaves the stored value indistinguishable from what was already there,
 * in which case no change is reported.
 *
 * The comparison is structural rather than by reference. A stored value is by definition
 * one {@link Namespace.isSerializable} accepts — a primitive, a `Date`, or a plain
 * object/array of those — so its size is bounded by what can be written to a save file,
 * and the common authoring idioms rebuild the container even when nothing inside it moved
 * (`assign({...})`, `set(k, v => ({...v, gold: v.gold}))`, or a value round-tripped through
 * a host). Reference equality would call every one of those a change, which is exactly the
 * no-op callback storm this gate exists to prevent.
 *
 * Not `deepEqual` from `@lib/util/data`: that one compares by own enumerable keys, and a
 * `Date` has none, so it reports any two dates as equal and would swallow a real change.
 *
 * Values outside the serializable domain (a class instance, a function — `set` warns but
 * still stores them) are only equal to themselves, so they always report a change.
 *
 * @internal
 */
function isSameStoredValue(previous: unknown, next: unknown): boolean {
    if (Object.is(previous, next)) {
        return true;
    }
    if (previous instanceof Date || next instanceof Date) {
        return previous instanceof Date
            && next instanceof Date
            && previous.getTime() === next.getTime();
    }
    if (Array.isArray(previous) || Array.isArray(next)) {
        return Array.isArray(previous)
            && Array.isArray(next)
            && previous.length === next.length
            && previous.every((item, index) => isSameStoredValue(item, next[index]));
    }
    if (isPlainObject(previous) && isPlainObject(next)) {
        const keys = Object.keys(previous);
        return keys.length === Object.keys(next).length
            && keys.every(key =>
                Object.prototype.hasOwnProperty.call(next, key)
                && isSameStoredValue(previous[key], next[key]));
    }
    return false;
}

export class Namespace<T extends NameSpaceContent<keyof T>> {
    static isSerializable(value: any): boolean {
        if (["number", "string", "boolean"].includes(typeof value)) {
            return true;
        }
        if (value instanceof Date) {
            return true;
        }
        if (value === null || value === undefined) {
            return true;
        }
        if (Array.isArray(value)) {
            return value.every(Namespace.isSerializable);
        }
        if (typeof value === "object") {
            return Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(Namespace.isSerializable);
        }
        return false;
    }

    name: string;
    /**@internal */
    key: string;
    /**@internal */
    content: NameSpaceContent<keyof T>;
    /**@internal */
    defaultContent: T;
    /**
     * The storable this namespace is registered in, and therefore where its change events go.
     * A namespace that has not been registered yet reports nothing.
     * @internal
     */
    private owner: Storable | null = null;

    constructor(name: string, initContent: T, key?: string) {
        this.name = name;
        this.key = key || name;
        this.content = deepMerge({}, initContent);
        this.defaultContent = initContent;
    }

    public set<Key extends keyof T>(key: Key, value: T[Key]): this {
        const previous = this.content[key];
        if (!Namespace.isSerializable(value)) {
            console.warn(`Value "${value}" in key "${String(key)}" is not serializable, and will not be set\n    at namespace "${this.name}"`);
            this.content[key] = value;
            this.reportChange(key, previous, value);
            return this;
        }
        this.content[key] = value;
        this.reportChange(key, previous, value);
        return this;
    }

    public get<Key extends keyof T = any>(key: Key): T[Key] {
        return this.content[key] as T[Key];
    }

    public equals<Key extends keyof T = any>(key: Key, value: T[Key]): boolean {
        return this.content[key] === value;
    }

    public assign(values: Partial<T>): this {
        Object.entries(values).forEach(([key, value]) => {
            this.set(key as keyof T, value as any);
        });
        return this;
    }

    public has(key: keyof T): boolean {
        return this.content[key] !== undefined;
    }

    public keys(): (keyof T)[] {
        return Object.keys(this.content) as (keyof T)[];
    }

    public values(): T[keyof T][] {
        return Object.values(this.content) as T[keyof T][];
    }

    public entries(): [keyof T, T[keyof T]][] {
        return Object.entries(this.content) as [keyof T, T[keyof T]][];
    }

    /**
     * Restore the author's defaults.
     *
     * Reports one change per key that actually moved. A key written after construction is
     * not in the defaults, so it is dropped and reported as changing to `undefined`.
     */
    public reset(): this {
        const previous = this.content;
        this.content = deepMerge({}, this.defaultContent);

        const keys = new Set<keyof T>([
            ...Object.keys(previous),
            ...Object.keys(this.content),
        ] as (keyof T)[]);
        keys.forEach(key => {
            this.reportChange(key, previous[key], this.content[key]);
        });
        return this;
    }

    /**@internal */
    getContent(): T {
        return this.content as T;
    }

    /**@internal */
    toData(): SerializedNamespaceData {
        return this.serialize();
    }

    /**
     * Replace the contents with a serialized snapshot, discarding any key the snapshot
     * does not carry. Use this to rewind to an exact previous state; use
     * {@link Namespace.deserialize} to layer saved values over existing defaults.
     * @internal
     */
    load(data: SerializedNamespaceData) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        this.content = {};
        this.deserialize(data);
    }

    /**@internal */
    serialize() {
        const output: { [key: string]: WrappedStorableData } = {};
        Object.entries(this.content).forEach(([key, value]) => {
            output[key] = this.wrap(value as any);
        });
        return output;
    }

    /**
     * Layer a serialized snapshot over the current contents. Keys the snapshot does not
     * carry keep their current value, so a namespace that gained a key after a save was
     * written still reads that key's default when the save is loaded.
     *
     * This reports a single {@link StorableRestore}, not one change per key. A save carries
     * every key of every namespace it knew about, so per-key reporting would turn one load
     * into hundreds of callbacks describing a history the player never lived through — the
     * values did not evolve, they were replaced wholesale. A host that keeps a derived view
     * of the store re-reads it on the restore signal; a host watching one key re-checks that
     * key. Ordinary play, where values do evolve one write at a time, is unaffected.
     * @internal
     */
    deserialize(data: SerializedNamespaceData) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        Object.entries(data).forEach(([key, value]) => {
            this.content[key as keyof T] = this.unwrap(value);
        });
        this.owner?.reportRestore(this.key);
    }

    /**@internal */
    toTypeName(value: StorableType): BaseStorableTypeName {
        if (value instanceof Date) {
            return "date";
        }
        return "any";
    }

    /**@internal */
    wrap(data: StorableType) {
        const handlers: {
            [K in BaseStorableTypeName]: BaseStorableSerializeHandlers[K]
        } = {
            any: (value) => ({type: "any", data: value}),
            date: (value) => ({type: "date", data: value.toString()}),
        };
        const type = this.toTypeName(data);
        return handlers[type](data as any);
    }

    /**@internal */
    unwrap(data: WrappedStorableData): StorableType {
        const handlers: {
            [K in BaseStorableTypeName]: BaseStorableDeserializeHandlers[K]
        } = {
            any: (data) => data.data,
            date: (data) => new Date(data.data),
        };
        return handlers[data.type](data);
    }

    /**@internal */
    attach(owner: Storable): this {
        this.owner = owner;
        return this;
    }

    /**@internal */
    detach(owner: Storable): this {
        if (this.owner === owner) {
            this.owner = null;
        }
        return this;
    }

    /**
     * Report a write to whoever is listening, unless the value did not actually move.
     * Called after the contents are updated, so a listener reading the namespace sees the
     * new value.
     * @internal
     */
    private reportChange(key: keyof T, previous: unknown, next: unknown): void {
        if (!this.owner || isSameStoredValue(previous, next)) {
            return;
        }
        this.owner.reportChange({
            namespace: this.key,
            key: String(key),
            previous: previous as StorableType,
            next: next as StorableType,
        });
    }
}

export class Storable {
    static EventTypes = {
        "event:storable.change": "event:storable.change",
        "event:storable.restore": "event:storable.restore",
    } as const;

    public static createNamespace<T extends NameSpaceContent<keyof T>>(name: string, initContent: T, key?: string): Namespace<T> {
        return new Namespace<T>(name, initContent, key);
    }

    /**
     * Changes to any value in any registered namespace. Prefer {@link Storable.onChange},
     * which filters by namespace and key.
     */
    public readonly events: EventDispatcher<StorableEvents> = new EventDispatcher();

    /**@internal */
    namespaces: { [key: string]: Namespace<any> } = {};
    /**
     * Collects the namespaces touched by one {@link Storable.load} so the whole load reports
     * a single restore rather than one per namespace.
     * @internal
     */
    private restoreBatch: Set<string> | null = null;

    /**@internal */
    constructor() {
        // A host watching persistent values registers one listener per watched key, which
        // passes the default warning threshold long before it is actually a problem.
        this.events.setMaxListeners(64);
    }

    public addNamespace<T extends NameSpaceContent<keyof T>>(namespace: Namespace<T>) {
        if (this.namespaces[namespace.key]) {
            return;
        }
        this.namespaces[namespace.key] = namespace;
        namespace.attach(this);
        return this;
    }

    public getNamespace<T extends NameSpaceContent<keyof T> = any>(key: string): Namespace<T> {
        if (!this.namespaces[key]) {
            throw new RuntimeGameError(`Namespace ${key} is not initialized, did you forget to register it?`
                + "\nUse `story.registerPersistent` to register a persistent namespace");
        }
        return this.namespaces[key];
    }

    public setNamespace<T extends NameSpaceContent<keyof T> = any>(key: string, namespace: Namespace<T>) {
        this.namespaces[key]?.detach(this);
        this.namespaces[key] = namespace;
        namespace.attach(this);
        return this;
    }

    public hasNamespace(key: string) {
        return !!this.namespaces[key];
    }

    public removeNamespace(key: string) {
        this.namespaces[key]?.detach(this);
        delete this.namespaces[key];
        return this;
    }

    public getNamespaces() {
        return this.namespaces;
    }

    keys() {
        return Object.keys(this.namespaces);
    }

    values() {
        return Object.values(this.namespaces);
    }

    entries() {
        return Object.entries(this.namespaces);
    }

    /**
     * Listen for a stored value changing.
     *
     * The listener runs after the new value is readable, and only when the value actually
     * moved — writing a value equal to the one already there reports nothing, so a line that
     * re-asserts a flag every time it runs does not wake anything up. Equality is structural,
     * so rebuilding an object with the same contents is also a no-op.
     *
     * Loading a save does not report changes; see {@link Storable.onRestore}.
     *
     * Subscriptions outlive the namespaces they watch: `newGame()` and loading a save both
     * rebuild every namespace from scratch, and a listener registered here survives that.
     *
     * @example
     * ```ts
     * // every change, anywhere
     * liveGame.getStorable().onChange(({namespace, key, previous, next}) => {...});
     *
     * // one namespace
     * liveGame.getStorable().onChange("persistent:player", ({key, next}) => {...});
     *
     * // one key
     * liveGame.getStorable().onChange("persistent:player", "gold", ({next}) => {
     *     if (next === 100) {...}
     * });
     * ```
     * @returns a token whose `cancel()` removes the listener
     */
    public onChange(listener: (change: StorableChange) => void): EventToken;
    public onChange(namespace: string, listener: (change: StorableChange) => void): EventToken;
    public onChange(namespace: string, key: string, listener: (change: StorableChange) => void): EventToken;
    public onChange(
        arg0: string | ((change: StorableChange) => void),
        arg1?: string | ((change: StorableChange) => void),
        arg2?: (change: StorableChange) => void
    ): EventToken {
        const namespace: string | null = typeof arg0 === "string" ? arg0 : null;
        const key: string | null = typeof arg1 === "string" ? arg1 : null;
        const listener: ((change: StorableChange) => void) | undefined =
            typeof arg0 === "function" ? arg0
                : typeof arg1 === "function" ? arg1
                    : arg2;
        if (!listener) {
            throw new RuntimeGameError("No listener provided when subscribing to storable changes");
        }

        return this.events.on(Storable.EventTypes["event:storable.change"], (change) => {
            if (namespace !== null && change.namespace !== namespace) {
                return;
            }
            if (key !== null && change.key !== key) {
                return;
            }
            listener(change);
        });
    }

    /**
     * Listen for the store being replaced wholesale — loading a save, or rewinding a
     * namespace to a snapshot. Fires once per bulk application, naming the namespaces
     * involved, instead of the changes it implies.
     *
     * Re-read whatever you derive from the store when this fires.
     *
     * @returns a token whose `cancel()` removes the listener
     */
    public onRestore(listener: (restore: StorableRestore) => void): EventToken {
        return this.events.on(Storable.EventTypes["event:storable.restore"], listener);
    }

    /**@internal */
    toData(): { [key: string]: SerializedNamespaceData } {
        return this.entries().reduce((acc, [key, namespace]) => {
            acc[key] = namespace.toData();
            return acc;
        }, {} as { [key: string]: SerializedNamespaceData });
    }

    /**@internal */
    load(data: { [key: string]: SerializedNamespaceData }) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        const batch = this.restoreBatch = new Set<string>();
        try {
            Object.entries(data).forEach(([key, content]) => {
                if (!this.namespaces[key]) {
                    // A namespace the save carries but nothing registered: a scene local, or a
                    // namespace from a version that had more of them. There are no authored
                    // defaults to preserve, so an empty one is the honest starting point.
                    this.addNamespace(new Namespace(key, {}));
                }
                this.namespaces[key].deserialize(content);
            });
        } finally {
            this.restoreBatch = null;
        }
        this.events.emit(Storable.EventTypes["event:storable.restore"], {
            namespaces: Array.from(batch),
        });
    }

    /**
     * Drop every namespace. Reports nothing: this is how the store is rebuilt (`newGame()`,
     * and the re-registration that precedes loading a save), not a value moving, and whatever
     * follows it announces itself. Listeners are deliberately kept.
     * @internal
     */
    clear() {
        this.values().forEach(namespace => namespace.detach(this));
        this.namespaces = {};
        return this;
    }

    /**@internal */
    reportChange(change: StorableChange): void {
        this.events.emit(Storable.EventTypes["event:storable.change"], change);
    }

    /**@internal */
    reportRestore(namespaceKey: string): void {
        if (this.restoreBatch) {
            this.restoreBatch.add(namespaceKey);
            return;
        }
        this.events.emit(Storable.EventTypes["event:storable.restore"], {
            namespaces: [namespaceKey],
        });
    }
}


