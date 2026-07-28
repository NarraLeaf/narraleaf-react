import { describe, expect, it, vi } from "vitest";
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
 * A stored value nests as deep as the author likes, which the save format did not originally
 * allow for: it tagged the whole value `"any"` or `"date"` and had nowhere to say that the
 * third element of a list held a `Date`. These cover the scheme that replaced it — plain JSON
 * in `data`, with the positions JSON cannot express named alongside it — and the two things
 * that scheme has to get right: it has to read every save written before it existed, and it
 * has to fail loudly rather than hang on data that cannot be written at all.
 */
describe("Namespace nested values", () => {
    const save = (namespace: Namespace<any>): any => JSON.parse(JSON.stringify(namespace.serialize()));
    const reload = (data: any): Namespace<any> => {
        const namespace = new Namespace<any>("test", {});
        namespace.load(data);
        return namespace;
    };
    const written = (key: string, value: unknown): any => {
        const namespace = new Namespace<any>("test", {});
        namespace.set(key, value);
        return namespace.serialize()[key];
    };

    it("round-trips a Date inside an object inside an array", () => {
        const namespace = new Namespace<any>("test", {});
        namespace.set("party", [
            { name: "yuko", metAt: new Date("2020-01-02T03:04:05.123Z") },
            { name: "mika", metAt: new Date("2021-06-07T08:09:10.456Z") },
        ]);

        const party = reload(save(namespace)).get("party") as any[];

        expect(party[0].metAt).toBeInstanceOf(Date);
        expect(party[1].metAt).toBeInstanceOf(Date);
        expect(party[0].metAt.toISOString()).toBe("2020-01-02T03:04:05.123Z");
        expect(party[1].metAt.toISOString()).toBe("2021-06-07T08:09:10.456Z");
        expect(party[0].name).toBe("yuko");
    });

    it("names a nested Date by position instead of putting a marker inside the value", () => {
        // The marker-in-the-value alternative is unsafe by construction: whatever object shape
        // means "this was a Date" is a shape an author can also store, and then their data
        // decodes as a date. A position cannot collide with anything.
        expect(written("party", [{ metAt: new Date("2020-01-02T03:04:05.123Z") }])).toEqual({
            type: "any",
            data: [{ metAt: "2020-01-02T03:04:05.123Z" }],
            dates: [[0, "metAt"]],
        });
    });

    it("writes a value holding no Date and no undefined exactly as it always did", () => {
        // The compatibility claim runs both ways: a save this version writes is still a save
        // the previous one reads, for every value that had a representation there.
        const wrapped = written("stats", { hp: 3, skills: ["slash", "parry"], nested: { deep: true } });

        expect(Object.keys(wrapped)).toEqual(["type", "data"]);
        expect(wrapped).toEqual({
            type: "any",
            data: { hp: 3, skills: ["slash", "parry"], nested: { deep: true } },
        });
    });

    it("writes a root Date as ISO 8601, which keeps the milliseconds the old format dropped", () => {
        const namespace = new Namespace<any>("test", {});
        namespace.set("when", new Date("2020-01-02T03:04:05.123Z"));

        expect(namespace.serialize().when).toEqual({ type: "date", data: "2020-01-02T03:04:05.123Z" });
        expect((reload(save(namespace)).get("when") as Date).toISOString())
            .toBe("2020-01-02T03:04:05.123Z");
    });

    it("round-trips empty arrays and empty objects", () => {
        const namespace = new Namespace<any>("test", {});
        namespace.set("empties", { list: [], map: {}, deep: [[], [{}]] });

        const empties = reload(save(namespace)).get("empties") as any;

        expect(empties).toEqual({ list: [], map: {}, deep: [[], [{}]] });
        expect(Array.isArray(empties.list)).toBe(true);
        expect(Array.isArray(empties.map)).toBe(false);
    });

    it("round-trips null and undefined at depth, keeping them apart", () => {
        const namespace = new Namespace<any>("test", {});
        namespace.set("bag", { nothing: null, missing: undefined, list: [null, undefined, 1] });

        const bag = reload(save(namespace)).get("bag") as any;

        expect(bag.nothing).toBe(null);
        expect(bag.missing).toBe(undefined);
        // JSON drops an undefined property outright; the position list is what puts the key
        // back, so a reloaded object has the same shape as the one that was saved.
        expect(Object.prototype.hasOwnProperty.call(bag, "missing")).toBe(true);
        expect(bag.list[0]).toBe(null);
        expect(bag.list[1]).toBe(undefined);
        expect(bag.list[2]).toBe(1);
    });

    it("saves the same object reached twice as two independent copies", () => {
        const shared = { hp: 3 };
        const namespace = new Namespace<any>("test", {});
        namespace.set("pair", [shared, shared]);

        const pair = reload(save(namespace)).get("pair") as any[];

        expect(pair).toEqual([{ hp: 3 }, { hp: 3 }]);
        expect(pair[0]).not.toBe(pair[1]);
    });

    it("takes a snapshot later mutation cannot reach back into", () => {
        const stats = { hp: 3 };
        const namespace = new Namespace<any>("test", {});
        namespace.set("stats", stats);
        const snapshot = namespace.toData();

        stats.hp = 99;

        expect(reload(snapshot).get("stats")).toEqual({ hp: 3 });
    });
});

describe("Namespace values that cannot be saved", () => {
    const quietly = <T>(run: () => T): { result: T; warnings: string[] } => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => void 0);
        try {
            return { result: run(), warnings: warn.mock.calls.map(call => String(call[0])) };
        } finally {
            warn.mockRestore();
        }
    };

    it("refuses to save a value that refers back to itself, naming where", () => {
        // Rejected rather than repaired: cutting the back-edge would write a save that loads
        // as a different object graph than the one the author built, and they would find out
        // much later. `set` has already warned by this point.
        const node: any = { name: "root" };
        node.self = node;

        const { result: namespace } = quietly(() => {
            const created = new Namespace<any>("test", {});
            created.set("node", node);
            return created;
        });

        expect(() => namespace.serialize()).toThrow(/refers back to itself/);
        expect(() => namespace.serialize()).toThrow(/\.self/);
    });

    it("reports a self-referring value as not serializable instead of recursing forever", () => {
        const node: any = {};
        node.self = node;

        expect(Namespace.isSerializable(node)).toBe(false);
    });

    it("accepts a value reachable twice, which is not a cycle", () => {
        const shared = { hp: 3 };

        expect(Namespace.isSerializable({ a: shared, b: shared })).toBe(true);
    });

    it("stores a leaf that was never storable as null and says where it was", () => {
        // The alternative, throwing, would cost the player a save over one stray value that
        // was already being lost silently. The key survives with a null in it, so the shape
        // the author reads back is the shape they wrote.
        class Sword {
            constructor(public readonly edge = "keen") {
            }
        }

        const { result, warnings } = quietly(() => {
            const namespace = new Namespace<any>("test", {});
            namespace.set("bag", { gold: 1, onUse: () => 0, weapon: new Sword(), tag: Symbol("x") });
            const reloaded = new Namespace<any>("test", {});
            reloaded.load(JSON.parse(JSON.stringify(namespace.serialize())));
            return reloaded.get("bag");
        });

        expect(result).toEqual({ gold: 1, onUse: null, weapon: null, tag: null });
        expect(warnings.some(message => message.includes(".onUse"))).toBe(true);
        expect(warnings.some(message => message.includes("Sword"))).toBe(true);
    });

    it("refuses a value nested past the depth cap rather than overflowing the stack", () => {
        let deep: any = "bottom";
        for (let index = 0; index < 200; index++) {
            deep = { next: deep };
        }

        const { result: namespace } = quietly(() => {
            const created = new Namespace<any>("test", {});
            created.set("chain", deep);
            return created;
        });

        expect(() => namespace.serialize()).toThrow(/nests deeper than 64/);
    });

    it("saves a value that stops short of the depth cap", () => {
        let deep: any = "bottom";
        for (let index = 0; index < 60; index++) {
            deep = { next: deep };
        }
        const namespace = new Namespace<any>("test", {});
        namespace.set("chain", deep);

        const reloaded = new Namespace<any>("test", {});
        reloaded.load(JSON.parse(JSON.stringify(namespace.serialize())));

        let cursor: any = reloaded.get("chain");
        for (let index = 0; index < 60; index++) {
            cursor = cursor.next;
        }
        expect(cursor).toBe("bottom");
    });
});

/**
 * The save format changed; the saves did not. Everything here reads data this build never
 * wrote, because the only useful proof of backward compatibility is one where the fixture
 * cannot drift along with the writer.
 */
describe("Namespace reading saves written before values could nest", () => {
    /**
     * One namespace exactly as 0.19 serialized it, typed out by hand. Note two things the old
     * writer did that are impossible to reproduce now: it emitted `Date.prototype.toString()`
     * for a root `Date`, and it had no tag at all for a nested one — `JSON.stringify` turned
     * that into an ISO string on the way out and the loader handed the string straight back.
     */
    const legacySave = {
        "persistent:player": {
            gold: { type: "any", data: 10 },
            name: { type: "any", data: "yuko" },
            seenIntro: { type: "any", data: false },
            nothing: { type: "any", data: null },
            // JSON drops an undefined property, so the writer's `data` key is simply absent
            missing: { type: "any" },
            stats: { type: "any", data: { hp: 3, mp: 1 } },
            tags: { type: "any", data: ["brave", "poor"] },
            born: { type: "date", data: "Thu Jan 02 2020 03:04:05 GMT+0000 (Coordinated Universal Time)" },
            meta: { type: "any", data: { lastSaved: "2020-01-02T03:04:05.000Z" } },
        },
    } as any;

    const loaded = (): Namespace<any> => {
        const storable = new Storable();
        storable.addNamespace(new Namespace<any>("persistent:player", { gold: 0, motto: "hi" }));
        storable.load(JSON.parse(JSON.stringify(legacySave)));
        return storable.getNamespace("persistent:player");
    };

    it("reads every value the old format could hold", () => {
        const namespace = loaded();

        expect(namespace.get("gold")).toBe(10);
        expect(namespace.get("name")).toBe("yuko");
        expect(namespace.get("seenIntro")).toBe(false);
        expect(namespace.get("nothing")).toBe(null);
        expect(namespace.get("missing")).toBe(undefined);
        expect(namespace.get("stats")).toEqual({ hp: 3, mp: 1 });
        expect(namespace.get("tags")).toEqual(["brave", "poor"]);
        // a key the save predates still reads its default
        expect(namespace.get("motto")).toBe("hi");
    });

    it("still parses a root Date written as Date.prototype.toString()", () => {
        const born = loaded().get("born");

        expect(born).toBeInstanceOf(Date);
        expect((born as Date).toISOString()).toBe("2020-01-02T03:04:05.000Z");
    });

    it("hands back a nested Date as the string the old format had already reduced it to", () => {
        // Not a regression — the type was gone before this loader ever saw the file, and
        // guessing that any ISO-shaped string used to be a Date would corrupt real strings.
        // Values saved from here on carry the position, so this only ever applies to old files.
        expect(loaded().get("meta")).toEqual({ lastSaved: "2020-01-02T03:04:05.000Z" });
    });

    it("re-saves a legacy save into a form that reads back the same", () => {
        const namespace = loaded();

        const resaved = new Namespace<any>("persistent:player", {});
        resaved.load(JSON.parse(JSON.stringify(namespace.serialize())));

        expect(resaved.get("gold")).toBe(10);
        expect(resaved.get("seenIntro")).toBe(false);
        expect(resaved.get("nothing")).toBe(null);
        expect(resaved.get("missing")).toBe(undefined);
        expect(resaved.get("stats")).toEqual({ hp: 3, mp: 1 });
        expect((resaved.get("born") as Date).toISOString()).toBe("2020-01-02T03:04:05.000Z");
    });

    it("reads a value tagged by a newer engine as-is instead of throwing the save away", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => void 0);
        const namespace = new Namespace<any>("test", {});

        namespace.deserialize({ future: { type: "bigint", data: "12" } } as any);

        expect(namespace.get("future")).toBe("12");
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
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
