export type StorableData<K extends string = string> = {
    [key in K]: number | boolean | string | StorableData | StorableData[] | undefined | null | Date;
};

/**
 * A value that stands on its own, with nothing inside it: a JSON primitive, or a `Date`.
 */
export type BaseStorableType = number | boolean | string | undefined | null | Date;
/**@internal */
export type UnserializableStorableType = Date;
export type BaseStorableTypeName = "any" | "date";
/**
 * Anything a namespace can hold.
 *
 * Plain objects and arrays nest freely — `{party: [{name: "yuko", metAt: new Date()}]}` is a
 * single stored value, and a `Date` buried anywhere inside it comes back as a `Date`. Only the
 * leaves are constrained, to {@link BaseStorableType}: a save file is JSON, and a class
 * instance, a `Map`, a function or a symbol has no representation in it.
 *
 * Two limits are enforced when the value is written to a save rather than when it is assigned,
 * because that is when they start to matter:
 *
 * - nesting is capped at 64 levels;
 * - a value that refers back to itself is rejected outright. A save is a tree; a cycle has no
 *   place in one, and cutting the back-edge would silently save a different object graph than
 *   the one the author built.
 *
 * Reference identity is not part of the value. Storing the same object at two positions saves
 * two copies, and loading produces two independent objects — the same bargain `JSON.stringify`
 * makes.
 */
export type StorableType =
    | BaseStorableType
    | { [key: string]: StorableType }
    | StorableType[];
/**
 * A position inside a stored value: the property keys walked from its root. `[]` is the value
 * itself, `["party", 0, "metAt"]` is the `metAt` of the first element of `party`.
 *
 * Array indices are written as numbers and object keys as strings, but both are read back with
 * plain property access, so the distinction is presentational.
 */
export type StorablePath = (string | number)[];
/**
 * A single stored value as it appears in a saved game. Values are tagged on the way out so
 * that types JSON cannot express (currently `Date`, and a nested `undefined`) survive the
 * round-trip.
 *
 * `data` is plain JSON. The two types JSON loses are not encoded in-band — no sentinel object
 * is inserted that a stored value could collide with — but named by position in `dates` and
 * `undefineds`, which the loader walks to put the real values back. Both are absent when there
 * is nothing to name, so a value holding neither serializes exactly as it did before this
 * scheme existed, and a save written before it loads unchanged.
 *
 * This is part of the on-disk save format rather than an implementation detail: it is what
 * {@link SavedGame}'s `store` actually contains. Read it through `Namespace`, never by hand.
 */
export type WrappedStorableData<T extends StorableType = any> = {
    type: BaseStorableTypeName;
    data: T;
    /** Positions in `data` that held a `Date`, stored as an ISO 8601 string. */
    dates?: StorablePath[];
    /** Positions in `data` that held `undefined`, stored as `null`. */
    undefineds?: StorablePath[];
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
    K extends "any" ? StorableTypeSerializer<Exclude<StorableType, UnserializableStorableType>> :
        K extends "date" ? StorableTypeSerializer<Date> :
            never;
}
/**@internal */
export type BaseStorableDeserializeHandlers = {
    [K in BaseStorableTypeName]:
    K extends "any" ? (data: WrappedStorableData) => StorableType :
        K extends "date" ? (data: WrappedStorableData) => Date :
            never;
}
export type NameSpaceContent<T extends string | number | symbol> = { [K in T]?: StorableType };
