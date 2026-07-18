import { describe, expect, it } from "vitest";
import { Namespace, Storable } from "@core/elements/persistent/storable";

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
