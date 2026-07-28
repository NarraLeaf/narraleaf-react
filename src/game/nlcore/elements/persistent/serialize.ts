import { RuntimeGameError } from "@core/common/Utils";
import { StorablePath, StorableType } from "@core/elements/persistent/type";

/**
 * How deep a stored value may nest before the walk refuses to go further.
 *
 * The encoder is recursive, so an unbounded walk over a deep structure is a stack overflow
 * reported as a `RangeError` from somewhere unrelated. The cap turns that into an error that
 * names the offending position. It is not a budget authors should ever feel: game state that
 * nests past 64 levels is a data-structure bug, not a save.
 *
 * The decoder does not recurse — it walks each recorded position iteratively — so a hostile
 * save cannot blow the stack on the way in. (`JSON.parse` gets there first regardless.)
 *
 * @internal
 */
export const MaxStorableDepth = 64;

/**
 * The result of flattening one stored value: plain JSON, plus the positions inside it that
 * JSON cannot represent on its own.
 * @internal
 */
export type EncodedStorableValue = {
    data: unknown;
    dates: StorablePath[];
    undefineds: StorablePath[];
};

/**@internal */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Render a position for a human: `.party[0].metAt`, or `the value itself` for the root.
 * @internal
 */
function formatPath(path: StorablePath): string {
    if (!path.length) {
        return "the value itself";
    }
    return path
        .map(segment => typeof segment === "number" ? `[${segment}]` : `.${segment}`)
        .join("");
}

/**
 * Whether a value can be written to a save, all the way down.
 *
 * Cycle-safe: a value that refers back to itself reports `false` rather than recursing until
 * the stack gives out. A value reachable twice by different routes is fine — only a genuine
 * back-edge is a cycle — and so is anything within {@link MaxStorableDepth} levels.
 *
 * @internal
 */
export function isStorableValue(value: unknown, depth = 0, seen: Set<object> = new Set()): boolean {
    if (depth > MaxStorableDepth) {
        return false;
    }
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        return true;
    }
    if (value === null || value === undefined || value instanceof Date) {
        return true;
    }
    if (typeof value !== "object") {
        return false;
    }
    if (seen.has(value)) {
        return false;
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return value.every(item => isStorableValue(item, depth + 1, seen));
        }
        if (!isPlainObject(value)) {
            return false;
        }
        return Object.values(value).every(item => isStorableValue(item, depth + 1, seen));
    } finally {
        seen.delete(value);
    }
}

/**
 * Flatten a stored value into JSON, recording where the two types JSON loses used to be.
 *
 * `Date` becomes its ISO 8601 string and `undefined` becomes `null`, each with its position
 * appended to the matching list. Nothing is inserted into `data` that was not already a
 * position in the value, so a stored object can never be mistaken for an encoding marker —
 * which is the failure mode of every in-band sentinel scheme.
 *
 * Throws {@link RuntimeGameError} on a cycle or past {@link MaxStorableDepth}. Coerces a leaf
 * that was never storable (a function, a symbol, a `bigint`, a class instance, a `Map`) to
 * `null` and warns, naming the position: the value was going to be lost either way, and
 * keeping the position means the surrounding shape survives instead of a key silently
 * disappearing or an array index shifting.
 *
 * @param value - the stored value
 * @param where - how to name the value in an error or a warning, e.g. `namespace "player", key "party"`
 * @internal
 */
export function encodeStorableValue(value: StorableType, where: string): EncodedStorableValue {
    const dates: StorablePath[] = [];
    const undefineds: StorablePath[] = [];
    const data = encode(value, [], 0, new Set<object>(), dates, undefineds, where);
    return { data, dates, undefineds };
}

/**@internal */
function encode(
    value: unknown,
    path: StorablePath,
    depth: number,
    seen: Set<object>,
    dates: StorablePath[],
    undefineds: StorablePath[],
    where: string,
): unknown {
    if (depth > MaxStorableDepth) {
        throw new RuntimeGameError(
            `A stored value nests deeper than ${MaxStorableDepth} levels and cannot be saved`
            + `\n    at ${where}, ${formatPath(path)}`
            + "\n    A saved game this deep is almost always a data-structure bug. Flatten the value,"
            + "\n    or keep the deep part outside the store and save an id for it."
        );
    }
    if (value === undefined) {
        undefineds.push([...path]);
        return null;
    }
    if (value === null) {
        return null;
    }
    if (value instanceof Date) {
        dates.push([...path]);
        return value.toISOString();
    }
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "object") {
        if (seen.has(value)) {
            throw new RuntimeGameError(
                "A stored value refers back to itself and cannot be saved"
                + `\n    at ${where}, ${formatPath(path)}`
                + "\n    A saved game is a tree. Cutting the back-edge would save a different object graph"
                + "\n    than the one you built, so this is refused rather than guessed at — break the"
                + "\n    reference, or store an id in place of the object."
            );
        }
        if (Array.isArray(value) || isPlainObject(value)) {
            seen.add(value);
            try {
                if (Array.isArray(value)) {
                    return value.map((item, index) =>
                        encode(item, [...path, index], depth + 1, seen, dates, undefineds, where));
                }
                const output: Record<string, unknown> = {};
                Object.entries(value).forEach(([key, item]) => {
                    output[key] = encode(item, [...path, key], depth + 1, seen, dates, undefineds, where);
                });
                return output;
            } finally {
                seen.delete(value);
            }
        }
    }

    console.warn(
        `Value of type "${describeType(value)}" cannot be saved and was stored as null`
        + `\n    at ${where}, ${formatPath(path)}`
    );
    return null;
}

/**@internal */
function describeType(value: unknown): string {
    if (typeof value !== "object" || value === null) {
        return typeof value;
    }
    return value.constructor?.name ?? "object";
}

/**
 * Put back what {@link encodeStorableValue} flattened.
 *
 * Both position lists are optional and absent from every save written before they existed, in
 * which case `data` is returned as it was read — which is exactly what the previous loader did
 * with it, and why old saves load unchanged.
 *
 * A position that does not resolve against `data` (a hand-edited save, a truncated file) is
 * skipped rather than thrown on: the rest of the value is still worth having.
 *
 * @internal
 */
export function decodeStorableValue(
    data: unknown,
    dates: StorablePath[] | undefined,
    undefineds: StorablePath[] | undefined,
): StorableType {
    let root = reviveAt(data, dates, toDate);
    root = reviveAt(root, undefineds, () => undefined);
    return root as StorableType;
}

/**@internal */
function reviveAt(
    root: unknown,
    paths: StorablePath[] | undefined,
    revive: (value: unknown) => unknown,
): unknown {
    if (!Array.isArray(paths) || !paths.length) {
        return root;
    }
    let result = root;
    for (const path of paths) {
        if (!Array.isArray(path)) {
            continue;
        }
        if (!path.length) {
            result = revive(result);
            continue;
        }
        let cursor: any = result;
        for (let i = 0; i < path.length - 1 && cursor !== null && typeof cursor === "object"; i++) {
            cursor = cursor[path[i]];
        }
        if (cursor === null || typeof cursor !== "object") {
            continue;
        }
        const last = path[path.length - 1];
        cursor[last] = revive(cursor[last]);
    }
    return result;
}

/**
 * Read a saved date back.
 *
 * Accepts the ISO 8601 string written now and the `Date.prototype.toString()` output written
 * by every version before it — both parse, which is what keeps existing saves loading.
 *
 * @internal
 */
export function toDate(value: unknown): Date {
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === "string" || typeof value === "number") {
        return new Date(value);
    }
    return new Date(NaN);
}
