import {
    BaseStorableDeserializeHandlers,
    BaseStorableSerializeHandlers,
    BaseStorableTypeName,
    NameSpaceContent,
    StorableData,
    StorableType,
    WrappedStorableData
} from "@core/elements/persistent/type";
import {deepMerge} from "@lib/util/data";
import {RuntimeGameError} from "@core/common/Utils";

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

    constructor(name: string, initContent: T, key?: string) {
        this.name = name;
        this.key = key || name;
        this.content = deepMerge({}, initContent);
        this.defaultContent = initContent;
    }

    public set<Key extends keyof T>(key: Key, value: T[Key]): this {
        if (!Namespace.isSerializable(value)) {
            console.warn(`Value "${value}" in key "${String(key)}" is not serializable, and will not be set\n    at namespace "${this.name}"`);
            this.content[key] = value;
            return this;
        }
        this.content[key] = value;
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

    public reset(): this {
        this.content = deepMerge({}, this.defaultContent);
        return this;
    }

    /**@internal */
    toData(): { [key: string]: WrappedStorableData } {
        return this.serialize();
    }

    /**@internal */
    load(data: T) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        this.content = data;
    }

    /**@internal */
    serialize() {
        const output: { [key: string]: WrappedStorableData } = {};
        Object.entries(this.content).forEach(([key, value]) => {
            output[key] = this.wrap(value as any);
        });
        return output;
    }

    /**@internal */
    deserialize(data: { [key: string]: WrappedStorableData }) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        Object.entries(data).forEach(([key, value]) => {
            this.content[key as keyof T] = this.unwrap(value);
        });
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
}

export class Storable {
    /**@internal */
    namespaces: { [key: string]: Namespace<any> } = {};

    /**@internal */
    constructor() {
    }

    public addNamespace<T extends NameSpaceContent<keyof T>>(namespace: Namespace<T>) {
        if (this.namespaces[namespace.key]) {
            return;
        }
        this.namespaces[namespace.key] = namespace;
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
        this.namespaces[key] = namespace;
        return this;
    }

    public hasNamespace(key: string) {
        return !!this.namespaces[key];
    }

    public removeNamespace(key: string) {
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

    /**@internal */
    toData() {
        return this.entries().reduce((acc, [key, namespace]) => {
            acc[key] = namespace.toData();
            return acc;
        }, {} as { [key: string]: StorableData });
    }

    /**@internal */
    load(data: { [key: string]: StorableData }) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        Object.entries(data).forEach(([key, content]) => {
            if (this.namespaces[key]) {
                this.namespaces[key].load(content);
            } else {
                this.namespaces[key] = new Namespace(key, content as any);
            }
        });
    }

    /**@internal */
    clear() {
        this.namespaces = {};
        return this;
    }
}


