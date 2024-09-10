import {
    BaseStorableDeserializeHandlers,
    BaseStorableSerializeHandlers,
    BaseStorableTypeName,
    NameSpaceContent,
    StorableData,
    StorableType,
    WrappedStorableData
} from "@core/store/type";

export class Namespace<T extends NameSpaceContent<keyof T>> {
    name: string;
    key: string;
    content: NameSpaceContent<keyof T>;

    constructor(name: string, initContent: T, key?: string) {
        this.name = name;
        this.key = key || name;
        this.content = initContent;
    }

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

    set<Key extends keyof T>(key: Key, value: T[Key]): this {
        if (!Namespace.isSerializable(value)) {
            console.warn(`Value "${value}" in key "${String(key)}" is not serializable, and will not be set\nat namespace "${this.name}"`);
            this.content[key] = value;
            return this;
        }
        this.content[key] = value;
        return this;
    }

    get<Key extends keyof T>(key: Key): T[Key] {
        return this.content[key] as T[Key];
    }

    toData(): { [key: string]: WrappedStorableData } {
        return this.serialize();
    }

    load(data: T) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        this.content = data;
    }

    serialize() {
        const output: { [key: string]: WrappedStorableData } = {};
        Object.entries(this.content).forEach(([key, value]) => {
            output[key] = this.wrap(value as any);
        });
        return output;
    }

    deserialize(data: { [key: string]: WrappedStorableData }) {
        if (!data) {
            console.warn("No data to load");
            return;
        }
        Object.entries(data).forEach(([key, value]) => {
            this.content[key as keyof T] = this.unwrap(value);
        });
    }

    toTypeName(value: StorableType): BaseStorableTypeName {
        if (value instanceof Date) {
            return "date";
        }
        return "any";
    }

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
    namespaces: { [key: string]: Namespace<any> } = {};

    constructor() {
    }

    addNamespace<T extends NameSpaceContent<keyof T>>(namespace: Namespace<T>) {
        this.namespaces[namespace.key] = namespace;
        return this;
    }

    getNamespace<T extends NameSpaceContent<keyof T>>(key: string): Namespace<T> {
        return this.namespaces[key];
    }

    setNamespace<T extends NameSpaceContent<keyof T>>(key: string, namespace: Namespace<T>) {
        this.namespaces[key] = namespace;
        return this;
    }

    getNamespaces() {
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

    toData() {
        return this.entries().reduce((acc, [key, namespace]) => {
            acc[key] = namespace.toData();
            return acc;
        }, {} as { [key: string]: StorableData });
    }

    public load(data: { [key: string]: StorableData }) {
        if (!data) {
            console.warn('No data to load');
            return;
        }
        Object.entries(data).forEach(([key, content]) => {
            if (this.namespaces[key]) {
                this.namespaces[key].load(content);
            } else {
                console.warn(`Namespace ${key} not found in ${this.constructor.name}`);
            }
        });
    }
}


