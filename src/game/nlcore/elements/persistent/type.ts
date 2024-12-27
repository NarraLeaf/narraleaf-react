export type StorableData<K extends string = string> = {
    [key in K]: number | boolean | string | StorableData | StorableData[] | undefined | null | Date;
};

/**@internal */
export type BaseStorableType = number | boolean | string | undefined | null | Date;
/**@internal */
export type UnserializableStorableType = Date;
/**@internal */
export type BaseStorableTypeName = "any" | "date";
/**@internal */
export type StorableType = BaseStorableType | Record<string, BaseStorableType> | Array<BaseStorableType>;
/**@internal */
export type WrappedStorableData<T extends StorableType = any> = {
    type: BaseStorableTypeName;
    data: T;
}
/**@internal */
export type StorableTypeSerializer<T, U extends StorableType = any> = (value: T) => WrappedStorableData<U>;
/**@internal */
export type BaseStorableSerializeHandlers = {
    [K in BaseStorableTypeName]:
    K extends "any" ? StorableTypeSerializer<Exclude<BaseStorableType, UnserializableStorableType>> :
        K extends "date" ? StorableTypeSerializer<Date> :
            never;
}
/**@internal */
export type BaseStorableDeserializeHandlers = {
    [K in BaseStorableTypeName]:
    K extends "any" ? (data: WrappedStorableData<Exclude<BaseStorableType, UnserializableStorableType>>) => Exclude<BaseStorableType, UnserializableStorableType> :
        K extends "date" ? (data: WrappedStorableData<Date>) => Date :
            never;
}
/**@internal */
export type NameSpaceContent<T extends string | number | symbol> = { [K in T]?: StorableType };
