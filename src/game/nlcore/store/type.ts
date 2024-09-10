export type StorableData<K extends string = string> = {
    [key in K]: number | boolean | string | StorableData | StorableData[] | undefined | null | Date;
};

export type BaseStorableType = number | boolean | string | undefined | null | Date;
export type UnserializableStorableType = Date;
export type BaseStorableTypeName = "any" | "date";
export type StorableType = BaseStorableType | Record<string, BaseStorableType> | Array<BaseStorableType>;
export type WrappedStorableData<T extends StorableType = any> = {
    type: BaseStorableTypeName;
    data: T;
}
export type StorableTypeSerializer<T, U extends StorableType = any> = (value: T) => WrappedStorableData<U>;
export type BaseStorableSerializeHandlers = {
    [K in BaseStorableTypeName]:
    K extends "any" ? StorableTypeSerializer<Exclude<BaseStorableType, UnserializableStorableType>> :
        K extends "date" ? StorableTypeSerializer<Date> :
            never;
}
export type BaseStorableDeserializeHandlers = {
    [K in BaseStorableTypeName]:
    K extends "any" ? (data: WrappedStorableData<Exclude<BaseStorableType, UnserializableStorableType>>) => Exclude<BaseStorableType, UnserializableStorableType> :
        K extends "date" ? (data: WrappedStorableData<Date>) => Date :
            never;
}
export type NameSpaceContent<T extends string | number | symbol> = { [K in T]: StorableType };
