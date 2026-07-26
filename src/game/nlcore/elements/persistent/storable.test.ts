import { describe, expect, it } from "vitest";
import { Namespace, Storable, StorableChange, StorableRestore } from "@core/elements/persistent/storable";

/**
 * These cover the save round-trip contract: `Storable.toData()` wraps every value as
 * `{type, data}`, so every read path has to unwrap it again. The pairing is easy to get
 * wrong silently — an un-unwrapped boolean stays an object, and an object is always
 * truthy, so a saved `false` flag reads back as true.
 */
describe("Namespace serialize/deserialize", () => {
    it("round-trips primitives, including falsy ones", () => {
        const ns = new Namespace("test", {
            num: 0,
            str: "",
            yes: true,
            no: false,
            nothing: null,
        });

        const restored = new Namespace("test", {
            num: -1,
            str: "x",
            yes: false,
            no: true,
            nothing: "x",
        });
        restored.deserialize(ns.serialize());

        expect(restored.get("num")).toBe(0);
        expect(restored.get("str")).toBe("");
        expect(restored.get("yes")).toBe(true);
        expect(restored.get("no")).toBe(false);
        expect(restored.get("nothing")).toBe(null);
    });

    it("round-trips Date as a Date instance", () => {
        const date = new Date("2020-01-02T03:04:05.000Z");
        const ns = new Namespace("test", { when: date });

        const restored = new Namespace("test", { when: new Date(0) });
        restored.deserialize(ns.serialize());

        expect(restored.get("when")).toBeInstanceOf(Date);
        expect((restored.get("when") as Date).getTime()).toBe(date.getTime());
    });

    it("round-trips nested plain objects and arrays", () => {
        const ns = new Namespace("test", {
            list: [1, 2, 3],
            nested: { a: 1, b: false },
        });

        const restored = new Namespace("test", { list: [], nested: {} });
        restored.deserialize(ns.serialize());

        expect(restored.get("list")).toEqual([1, 2, 3]);
        expect(restored.get("nested")).toEqual({ a: 1, b: false });
    });

    it("load() replaces content and unwraps, dropping keys absent from the snapshot", () => {
        const ns = new Namespace<{ kept: boolean; addedLater?: number }>("test", { kept: false });
        const snapshot = ns.serialize();

        const live = new Namespace<{ kept: boolean; addedLater?: number }>("test", { kept: true });
        live.set("addedLater", 1);
        live.load(snapshot);

        expect(live.get("kept")).toBe(false);
        expect(live.get("addedLater")).toBe(undefined);
    });
});

describe("Storable save round-trip", () => {
    /** Mirrors LiveGame.serialize/deserialize: toData() out, clear().load() back in. */
    const roundTrip = (storable: Storable): Storable => {
        const data = JSON.parse(JSON.stringify(storable.toData()));
        const next = new Storable();
        next.clear().load(data);
        return next;
    };

    it("preserves a saved `false` as false, not a truthy wrapper", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:flags", { seenIntro: false }));

        const restored = roundTrip(storable);
        const value = restored.getNamespace("persistent:flags").get("seenIntro");

        expect(value).toBe(false);
        expect(Boolean(value)).toBe(false);
    });

    it("preserves values across a save/load/save/load cycle without nesting", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 10, name: "yuko" }));

        const once = roundTrip(storable);
        const twice = roundTrip(once);

        expect(twice.getNamespace("persistent:player").get("gold")).toBe(10);
        expect(twice.getNamespace("persistent:player").get("name")).toBe("yuko");
    });

    it("keeps author defaults so reset() and newly added keys still work after a load", () => {
        // The registered namespace exists before the save data is applied, the way
        // LiveGame re-inits namespaces on deserialize. `motto` is a key the save
        // predates; it must keep its default rather than vanish.
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 10 }));
        const saved = JSON.parse(JSON.stringify(storable.toData()));

        const next = new Storable();
        next.addNamespace(new Namespace("persistent:player", { gold: 0, motto: "hi" }));
        next.load(saved);

        const ns = next.getNamespace("persistent:player");
        expect(ns.get("gold")).toBe(10);
        expect(ns.get("motto")).toBe("hi");

        ns.reset();
        expect(ns.get("gold")).toBe(0);
        expect(ns.get("motto")).toBe("hi");
    });

    it("restores namespaces that were not registered up-front (e.g. scene locals)", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("local:scene1", { visited: false, count: 3 }));

        const restored = roundTrip(storable);
        const ns = restored.getNamespace("local:scene1");

        expect(ns.get("visited")).toBe(false);
        expect(ns.get("count")).toBe(3);
    });
});

/**
 * These cover the change-notification contract a host relies on to react to a persistent
 * value ("when `gold` reaches 100, do X") instead of polling the store. Two things make it
 * usable rather than merely present: a write that does not move the value stays quiet, and
 * loading a save reports itself once rather than replaying every key it carries.
 */
describe("Storable change events", () => {
    const changesOf = (storable: Storable): StorableChange[] => {
        const seen: StorableChange[] = [];
        storable.onChange(change => seen.push(change));
        return seen;
    };

    it("reports namespace, key, previous and next on a write", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 10 }));
        const seen = changesOf(storable);

        storable.getNamespace("persistent:player").set("gold", 100);

        expect(seen).toEqual([{
            namespace: "persistent:player",
            key: "gold",
            previous: 10,
            next: 100,
        }]);
    });

    it("has the new value readable by the time the listener runs", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 10 }));
        const readBack: unknown[] = [];
        storable.onChange(() => readBack.push(storable.getNamespace("persistent:player").get("gold")));

        storable.getNamespace("persistent:player").set("gold", 100);

        expect(readBack).toEqual([100]);
    });

    it("stays quiet when a write does not move the value", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", {
            gold: 10,
            stats: { hp: 3, mp: 1 },
            tags: ["brave", "poor"],
            born: new Date("2020-01-02T03:04:05.000Z"),
        }));
        const seen = changesOf(storable);
        const ns = storable.getNamespace("persistent:player");

        ns.set("gold", 10);
        // a rebuilt container with identical contents is the shape `assign` and
        // `set(k, v => ({...v}))` produce, and is not a change
        ns.set("stats", { hp: 3, mp: 1 });
        ns.set("tags", ["brave", "poor"]);
        ns.set("born", new Date("2020-01-02T03:04:05.000Z"));

        expect(seen).toEqual([]);
    });

    it("reports a value nested inside an object, a reordered array, and a date that moved", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", {
            stats: { hp: 3, mp: 1 },
            tags: ["brave", "poor"],
            born: new Date("2020-01-02T03:04:05.000Z"),
        }));
        const seen = changesOf(storable);
        const ns = storable.getNamespace("persistent:player");

        ns.set("stats", { hp: 4, mp: 1 });
        ns.set("tags", ["poor", "brave"]);
        ns.set("born", new Date("2021-01-02T03:04:05.000Z"));

        expect(seen.map(change => change.key)).toEqual(["stats", "tags", "born"]);
        expect(seen[0].previous).toEqual({ hp: 3, mp: 1 });
        expect(seen[0].next).toEqual({ hp: 4, mp: 1 });
    });

    it("reports a first write to a key that had no value as previous: undefined", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace<{ gold?: number; motto?: string }>("persistent:player", { gold: 10 }));
        const seen = changesOf(storable);

        storable.getNamespace("persistent:player").set("motto", "hi");

        expect(seen).toEqual([{
            namespace: "persistent:player",
            key: "motto",
            previous: undefined,
            next: "hi",
        }]);
    });

    it("reports one change per key that assign() actually moved", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 10, name: "yuko" }));
        const seen = changesOf(storable);

        storable.getNamespace("persistent:player").assign({ gold: 20, name: "yuko" });

        expect(seen).toEqual([{
            namespace: "persistent:player",
            key: "gold",
            previous: 10,
            next: 20,
        }]);
    });

    it("reports reset() as a return to defaults, and drops later keys as next: undefined", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace<{ gold?: number; motto?: string }>("persistent:player", { gold: 0 }));
        const ns = storable.getNamespace<{ gold?: number; motto?: string }>("persistent:player");
        ns.set("gold", 100);
        ns.set("motto", "hi");
        const seen = changesOf(storable);

        ns.reset();

        expect(seen).toEqual([
            { namespace: "persistent:player", key: "gold", previous: 100, next: 0 },
            { namespace: "persistent:player", key: "motto", previous: "hi", next: undefined },
        ]);
    });

    it("filters by namespace, and by namespace and key", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 0, name: "yuko" }));
        storable.addNamespace(new Namespace("persistent:world", { gold: 0 }));
        const byNamespace: string[] = [];
        const byKey: unknown[] = [];
        storable.onChange("persistent:player", change => byNamespace.push(change.key));
        storable.onChange("persistent:player", "gold", change => byKey.push(change.next));

        storable.getNamespace("persistent:player").set("gold", 1);
        storable.getNamespace("persistent:player").set("name", "mika");
        storable.getNamespace("persistent:world").set("gold", 9);

        expect(byNamespace).toEqual(["gold", "name"]);
        expect(byKey).toEqual([1]);
    });

    it("stops delivering once the token is cancelled", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 0 }));
        const seen: number[] = [];
        const token = storable.onChange("persistent:player", "gold", change => seen.push(change.next as number));

        storable.getNamespace("persistent:player").set("gold", 1);
        token.cancel();
        storable.getNamespace("persistent:player").set("gold", 2);

        expect(seen).toEqual([1]);
    });

    it("keeps subscriptions across the clear()+re-register that newGame() performs", () => {
        // LiveGame.initNamespaces() rebuilds every namespace on a fresh Storable instance
        // that is never itself replaced, so a host subscription has to survive it.
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 0 }));
        const seen = changesOf(storable);

        storable.clear();
        storable.addNamespace(new Namespace("persistent:player", { gold: 0 }));
        storable.getNamespace("persistent:player").set("gold", 5);

        expect(seen).toEqual([{
            namespace: "persistent:player",
            key: "gold",
            previous: 0,
            next: 5,
        }]);
    });

    it("goes quiet for a namespace that has been removed from the store", () => {
        const storable = new Storable();
        const ns = new Namespace("persistent:player", { gold: 0 });
        storable.addNamespace(ns);
        const seen = changesOf(storable);

        storable.removeNamespace("persistent:player");
        ns.set("gold", 5);

        expect(seen).toEqual([]);
    });

    it("writes to an unregistered namespace, which reports to nobody", () => {
        const ns = new Namespace("persistent:player", { gold: 0 });
        expect(() => ns.set("gold", 5)).not.toThrow();
        expect(ns.get("gold")).toBe(5);
    });
});

describe("Storable restore events", () => {
    it("loads a save as one restore and no per-key changes", () => {
        const source = new Storable();
        source.addNamespace(new Namespace("persistent:player", { gold: 100, name: "yuko" }));
        source.addNamespace(new Namespace("local:scene1", { visited: true }));
        const saved = JSON.parse(JSON.stringify(source.toData()));

        const target = new Storable();
        target.addNamespace(new Namespace("persistent:player", { gold: 0, name: "" }));
        const changes: StorableChange[] = [];
        const restores: StorableRestore[] = [];
        target.onChange(change => changes.push(change));
        target.onRestore(restore => restores.push(restore));

        target.load(saved);

        expect(changes).toEqual([]);
        expect(restores).toHaveLength(1);
        expect(restores[0].namespaces.sort()).toEqual(["local:scene1", "persistent:player"]);
        expect(target.getNamespace("persistent:player").get("gold")).toBe(100);
    });

    it("reports rewinding a single namespace to a snapshot as a restore of that namespace", () => {
        // The shape SceneAction uses to undo into a scene's locals.
        const storable = new Storable();
        const ns = new Namespace<{ visited: boolean }>("local:scene1", { visited: false });
        storable.addNamespace(ns);
        const snapshot = ns.toData();
        ns.set("visited", true);

        const changes: StorableChange[] = [];
        const restores: StorableRestore[] = [];
        storable.onChange(change => changes.push(change));
        storable.onRestore(restore => restores.push(restore));

        ns.load(snapshot);

        expect(changes).toEqual([]);
        expect(restores).toEqual([{ namespaces: ["local:scene1"] }]);
        expect(ns.get("visited")).toBe(false);
    });

    it("resumes reporting ordinary writes after a load", () => {
        const storable = new Storable();
        storable.addNamespace(new Namespace("persistent:player", { gold: 0 }));
        const saved = JSON.parse(JSON.stringify(storable.toData()));
        const changes: StorableChange[] = [];
        storable.onChange(change => changes.push(change));

        storable.load(saved);
        storable.getNamespace("persistent:player").set("gold", 7);

        expect(changes).toEqual([{
            namespace: "persistent:player",
            key: "gold",
            previous: 0,
            next: 7,
        }]);
    });
});
