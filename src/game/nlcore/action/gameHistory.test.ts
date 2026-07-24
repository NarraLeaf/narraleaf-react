import { describe, expect, it } from "vitest";
import type { Action } from "./action";
import type { ActionHistoryManager } from "./actionHistory";
import { GameHistoryManager } from "./gameHistory";
import type { SerializedGameState } from "../gameTypes";

/**
 * GameHistoryManager owns the user-facing backlog. These tests cover the v2 persistence surface:
 * serializing the backlog (with per-entry restore snapshots), trimming to a line, and rebuilding
 * from a save — including graceful drop of entries whose action no longer exists.
 */

// The manager only calls onUndo/onHistoryLimit on its ActionHistoryManager; a no-op stub is enough.
function createManager(): GameHistoryManager {
    const stub = {
        onUndo: () => void 0,
        onHistoryLimit: () => void 0,
    } as unknown as ActionHistoryManager;
    return new GameHistoryManager(stub);
}

const action = (id: string): Action => ({ getId: () => id } as unknown as Action);
const snapshot = (tag: string): SerializedGameState => ({
    store: { tag } as never,
    elementStates: [],
    stage: { scenes: [], audio: { sounds: [], groups: [] }, videos: [] } as never,
    services: {},
    stackModel: { items: [] },
    asyncStackModels: [],
});

describe("GameHistoryManager persistence (save format v2)", () => {
    it("serializes entries with action id, element, pending flag and snapshot", () => {
        const mgr = createManager();
        mgr.push({
            token: "t1",
            action: action("a-1"),
            element: { type: "say", text: "hi", voice: null, character: "A" },
            isPending: false,
            snapshot: snapshot("s1"),
        });

        const [entry] = mgr.serialize();
        expect(entry.actionId).toBe("a-1");
        expect(entry.element).toEqual({ type: "say", text: "hi", voice: null, character: "A" });
        expect(entry.isPending).toBe(false);
        expect(entry.snapshot).toEqual(snapshot("s1"));
    });

    it("serializes a null snapshot when capture was unavailable", () => {
        const mgr = createManager();
        mgr.push({
            token: "t1",
            action: action("a-1"),
            element: { type: "say", text: "hi", voice: null, character: null },
            isPending: false,
        });
        expect(mgr.serialize()[0].snapshot).toBeNull();
    });

    it("serializeUntil returns the inclusive prefix ending at the token", () => {
        const mgr = createManager();
        ["a-1", "a-2", "a-3"].forEach((id, i) => mgr.push({
            token: `t${i + 1}`,
            action: action(id),
            element: { type: "say", text: id, voice: null, character: null },
            snapshot: snapshot(id),
        }));

        const prefix = mgr.serializeUntil("t2");
        expect(prefix.map(e => e.actionId)).toEqual(["a-1", "a-2"]);
    });

    it("serializeUntil returns [] for an unknown token", () => {
        const mgr = createManager();
        mgr.push({ token: "t1", action: action("a-1"), element: { type: "say", text: "x", voice: null, character: null } });
        expect(mgr.serializeUntil("nope")).toEqual([]);
    });

    it("load rebinds actions, assigns fresh tokens, and preserves snapshots", () => {
        const mgr = createManager();
        const a1 = action("a-1");
        const a2 = action("a-2");
        const map = new Map<string, Action>([["a-1", a1], ["a-2", a2]]);

        mgr.load([
            { actionId: "a-1", element: { type: "say", text: "one", voice: null, character: null }, snapshot: snapshot("s1") },
            { actionId: "a-2", element: { type: "menu", text: "pick", selected: "left" }, isPending: false, snapshot: snapshot("s2") },
        ], map);

        const history = mgr.getHistory();
        expect(history).toHaveLength(2);
        expect(history[0].action).toBe(a1);
        expect(history[0].snapshot).toEqual(snapshot("s1"));
        expect(history[1].action).toBe(a2);
        expect(history[1].element).toEqual({ type: "menu", text: "pick", selected: "left" });
        // Fresh, unique tokens are minted on load (the persisted tokens are throwaway runtime handles).
        expect(history[0].token).toBeTruthy();
        expect(history[0].token).not.toBe(history[1].token);
    });

    it("load drops entries whose action no longer exists in the story", () => {
        const mgr = createManager();
        const a1 = action("a-1");
        const map = new Map<string, Action>([["a-1", a1]]); // "a-2" removed since the save

        mgr.load([
            { actionId: "a-1", element: { type: "say", text: "kept", voice: null, character: null }, snapshot: snapshot("s1") },
            { actionId: "a-2", element: { type: "say", text: "gone", voice: null, character: null }, snapshot: snapshot("s2") },
            { actionId: null, element: { type: "say", text: "anchorless", voice: null, character: null }, snapshot: null },
        ], map);

        const history = mgr.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].action).toBe(a1);
    });

    it("getByToken finds a live entry and returns null otherwise", () => {
        const mgr = createManager();
        mgr.push({ token: "t1", action: action("a-1"), element: { type: "say", text: "x", voice: null, character: null } });
        expect(mgr.getByToken("t1")?.token).toBe("t1");
        expect(mgr.getByToken("missing")).toBeNull();
    });
});
