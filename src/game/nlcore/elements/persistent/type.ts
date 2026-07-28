export type StorableData<K extends string = string> = {
    [key in K]: number | boolean | string | StorableData | StorableData[] | undefined | null | Date;
};

export type BaseStorableType = number | boolean | string | undefined | null | Date;
/**@internal */
export type UnserializableStorableType = Date;
export type BaseStorableTypeName = "any" | "date";
export type StorableType = BaseStorableType | Record<string, BaseStorableType> | Array<BaseStorableType>;
/**
 * A single stored value as it appears in a saved game. Values are tagged on the way out so
 * that types JSON cannot express (currently `Date`) survive the round-trip.
 *
 * This is part of the on-disk save format rather than an implementation detail: it is what
 * {@link SavedGame}'s `store` actually contains. Read it through `Namespace`, never by hand.
 */
export type WrappedStorableData<T extends StorableType = any> = {
    type: BaseStorableTypeName;
    data: T;
}
/**
 * One namespace's contents in a saved game: every value wrapped by {@link WrappedStorableData}.
 */
export type SerializedNamespaceData = {
    [key: string]: WrappedStorableData;
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
export type NameSpaceContent<T extends string | number | symbol> = { [K in T]?: StorableType };
