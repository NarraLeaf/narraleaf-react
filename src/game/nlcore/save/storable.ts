export type StorableData<K extends string = string> = {
    [key in K]: number | boolean | string | StorableData | StorableData[] | undefined | null | Date;
};

export enum NamespaceHistoryType {
    Set = 'Set',
    ArrayPush = 'ArrayPush',
    ArrayPop = 'ArrayPop',
    ArrayShift = 'ArrayShift',
    ArrayUnshift = 'ArrayUnshift',
}

type NamespaceHistory = {
    type: NamespaceHistoryType;
    key: string;
    value: any;
}

interface Transaction {
    history: NamespaceHistory[];
}

export class Namespace<T extends StorableData> {
    name: string;
    key: string;
    content: T;
    private history: Transaction[] = [];
    private currentTransaction: Transaction | null = null;

    static isSerializable(value: any) {
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
    }

    constructor(name: string, initContent: T, key?: string) {
        this.name = name;
        this.key = key || name;
        this.content = initContent;
    }

    startTransaction(): this {
        if (this.currentTransaction) {
            return this;
        }
        this.currentTransaction = {
            history: [],

        };
        return this;
    }

    commit(): number | null {
        if (!this.currentTransaction) {
            return null;
        }
        this.history.push(this.currentTransaction);
        this.currentTransaction = null;
        return this.history.length - 1;
    }

    /**
     * you can only undo the last transaction that was committed
     */
    undo(token?: number) {
        if (token === undefined) {
            token = this.history.length - 1;
        }
        if (token < 0 || token >= this.history.length || !this.history[token]) {
            return;
        }
        const transaction = this.history[token];
        for (let i = transaction.history.length - 1; i >= 0; i--) {
            const history = transaction.history[i];
            const key = history.key;
            switch (history.type) {
                case NamespaceHistoryType.Set:
                    const [old] = history.value;
                    (this.content[key] as any) = old;
                    break;
                case NamespaceHistoryType.ArrayPush:
                    (this.content[key] as any).pop();
                    break;
                case NamespaceHistoryType.ArrayPop:
                    (this.content[key] as any).push(history.value);
                    break;
                case NamespaceHistoryType.ArrayShift:
                    (this.content[key] as any).unshift(history.value);
                    break;
                case NamespaceHistoryType.ArrayUnshift:
                    (this.content[key] as any).shift();
                    break;
            }
        }
    }

    set<Key extends keyof T>(key: Key, value: T[Key]): this {
        if (this.currentTransaction) {
            this.currentTransaction.history.push({
                type: NamespaceHistoryType.Set,
                key: key as string,
                value: [this.content[key], value],
            });
        }
        if (!Namespace.isSerializable(value)) {
            console.warn(`Value ${value} is not serializable`);
            this.content[key] = value;
            return this;
        }
        this.content[key] = value;
        return this;
    }

    get<Key extends keyof T>(key: Key): T[Key] {
        return this.content[key];
    }

    arrayPush<Key extends keyof T>(key: Key, value: T[Key]): this {
        if (!Array.isArray(this.content[key])) {
            this.content[key] = [] as any;
        }
        (this.content[key] as any).push(value as any);
        if (this.currentTransaction) {
            this.currentTransaction.history.push({
                type: NamespaceHistoryType.ArrayPush,
                key: key as string,
                value,
            });
        }
        return this;
    }

    arrayPop<Key extends keyof T>(key: Key): this {
        if (!Array.isArray(this.content[key])) {
            return this;
        }
        const value = (this.content[key] as any).pop();
        if (this.currentTransaction) {
            this.currentTransaction.history.push({
                type: NamespaceHistoryType.ArrayPop,
                key: key as string,
                value,
            });
        }
        return this;
    }

    arrayShift<Key extends keyof T>(key: Key): this {
        if (!Array.isArray(this.content[key])) {
            return this;
        }
        const value = (this.content[key] as any).shift();
        if (this.currentTransaction) {
            this.currentTransaction.history.push({
                type: NamespaceHistoryType.ArrayShift,
                key: key as string,
                value,
            });
        }
        return this;
    }

    arrayUnshift<Key extends keyof T>(key: Key, value: T[Key]): this {
        if (!Array.isArray(this.content[key])) {
            this.content[key] = [] as any;
        }
        (this.content[key] as any).unshift(value as any);
        if (this.currentTransaction) {
            this.currentTransaction.history.push({
                type: NamespaceHistoryType.ArrayUnshift,
                key: key as string,
                value,
            });
        }
        return this;
    }

    toData(): T {
        return this.content;
    }

    load(data: T) {
        if (!data) {
            console.warn('No data to load');
            return;
        }
        this.content = data;
    }
}

export class Storable {
    namespaces: { [key: string]: Namespace<any> } = {};

    constructor() {
    }

    addNamespace<T extends StorableData>(namespace: Namespace<T>) {
        this.namespaces[namespace.key] = namespace;
        return this;
    }

    getNamespace<T extends StorableData>(key: string): Namespace<T> {
        return this.namespaces[key];
    }

    setNamespace<T extends StorableData>(key: string, namespace: Namespace<T>) {
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


