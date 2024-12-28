import {deepMerge, keyExcept} from "@lib/util/data";

type ConfigHandler<T, U> = (config: T) => U;
type ConfigHandlersDataType<T extends Record<string, any>> = {
    [K in keyof T]?: any
}
type MergeConfig<
    Raw extends Record<string, any>,
    Handlers extends ConfigHandlersDataType<Raw> = Record<string, any>,
> = {
    [K in keyof Raw]: K extends keyof Handlers
        ? Handlers[K]
        : Raw[K]
};

/**@internal */
export type ConfigHandlers<Raw extends Record<string, any>, Handlers extends ConfigHandlersDataType<Raw>> = {
    [K in keyof Raw]?: ConfigHandler<Raw[K], Handlers[K]>
}

export class ConfigConstructor<
    Raw extends Record<string, any>,
    Handlers extends ConfigHandlersDataType<Raw> = Record<string, any>,
> {
    private readonly handlers: ConfigHandlers<Raw, Handlers>;

    constructor(
        private defaultConfig: Raw,
        handlers?: ConfigHandlers<Raw, Handlers>,
    ) {
        this.handlers = handlers || {} as ConfigHandlers<Raw, Handlers>;
    }

    mergeWithDefaultConfig(
        config: Partial<Raw>,
    ): MergeConfig<Raw, Handlers> {
        return Object.fromEntries(
            Object.entries(this.defaultConfig)
                .map(([key, value]) => {
                    const newValue = config[key];
                    if (typeof newValue === "object" && !Array.isArray(newValue) && newValue !== null) {
                        return [
                            key,
                            deepMerge({}, newValue),
                        ];
                    }
                    return [
                        key,
                        newValue !== undefined ?
                            (this.handlers[key] ? this.handlers[key](newValue) : newValue) :
                            value,
                    ];
                })
        ) as MergeConfig<Raw, Handlers>;
    }

    create(
        config: Partial<Raw>,
    ): Config<Raw, Handlers> {
        return new Config(this.mergeWithDefaultConfig(config));
    }
}

export class Config<
    Raw extends Record<string, any>,
    Handlers extends ConfigHandlersDataType<Raw> = Record<string, any>,
> {
    constructor(
        private config: MergeConfig<Raw, Handlers>,
    ) {
    }

    public get(): MergeConfig<Raw, Handlers> {
        return this.config;
    }

    public copy(): Config<Raw, Handlers> {
        return new Config<Raw, Handlers>(deepMerge({}, this.config));
    }

    public join<T extends Record<string, any>>(
        config: T | Config<T, any>,
    ): Config<Omit<Raw, keyof T> & T, Handlers> {
        const extractedConfig: Omit<MergeConfig<Raw, Handlers>, Extract<keyof T, Extract<keyof MergeConfig<Raw, Handlers>, string>>> =
            keyExcept<MergeConfig<Raw, Handlers>, Extract<keyof T, Extract<keyof MergeConfig<Raw, Handlers>, string>>>(
                this.config,
                Object.keys(config)
            );
        return new Config<Omit<Raw, keyof T> & T, Handlers>(
            Object.assign(extractedConfig, config instanceof Config ? config.get() : config) as
                MergeConfig<Omit<Raw, keyof T> & T, Handlers>
        );
    }

    public extract<T extends Extract<keyof MergeConfig<Raw, Handlers>, string>>(
        keys: T[],
    ): [
        picked: Config<Pick<MergeConfig<Raw, Handlers>, T>, Handlers>,
        rest: Config<Omit<MergeConfig<Raw, Handlers>, T>, Handlers>,
    ] {
        const picked = {} as Pick<MergeConfig<Raw, Handlers>, T>;
        const rest = {} as Omit<MergeConfig<Raw, Handlers>, T>;
        for (const key of keys) {
            picked[key] = this.config[key];
        }
        for (const key in this.config) {
            if (!keys.includes(key as T)) {
                rest[key as Extract<keyof Omit<MergeConfig<Raw, Handlers>, T>, string>] = this.config[key];
            }
        }
        return [
            new Config(picked as MergeConfig<Pick<MergeConfig<Raw, Handlers>, T>, Handlers>),
            new Config(rest as MergeConfig<Omit<MergeConfig<Raw, Handlers>, T>, Handlers>),
        ];
    }
}

