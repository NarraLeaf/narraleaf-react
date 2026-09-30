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

    it("serializes only up to the play head, so a save made in the past carries no future", () => {
        const mgr = createManager();
        ["a-1", "a-2", "a-3"].forEach((id, i) => mgr.push({
            token: `t${i + 1}`,
            action: action(id),
            element: { type: "say", text: id, voice: null, character: null },
            snapshot: snapshot(id),
        }));

        mgr.setCursor(1);

        // The lines beyond the play head were read, and stepping forward reaches them again — but a
        // save written here is a save of this moment, and they are not part of it.
        expect(mgr.serialize().map(e => e.actionId)).toEqual(["a-1", "a-2"]);
        expect(mgr.serializeAll().map(e => e.actionId)).toEqual(["a-1", "a-2", "a-3"]);
    });

    it("load rebinds actions, mints tokens for entries that carry none, and preserves snapshots", () => {
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
        // These entries carry no token — a save written before tokens were persisted — so the
        // manager mints one rather than leaving the line unaddressable.
        expect(history[0].token).toBeTruthy();
        expect(history[0].token).not.toBe(history[1].token);
    });

    it("a token survives a serialize/load round trip", () => {
        const mgr = createManager();
        mgr.push({
            token: "keep-me",
            action: action("a-1"),
            element: { type: "say", text: "hi", voice: null, character: null },
            snapshot: snapshot("s1"),
        });

        const serialized = mgr.serialize();
        expect(serialized[0].token).toBe("keep-me");

        // A token is what a backlog UI holds and what `restoreToHistory` takes. Loading a save, and
        // restoring a line (which rebuilds the backlog through this same path), must not quietly
        // invalidate the reference the caller is holding — restoring to the same line twice used to
        // fail for exactly that reason.
        const loaded = createManager();
        loaded.load(serialized, new Map([["a-1", action("a-1")]]));
        expect(loaded.getHistory()[0].token).toBe("keep-me");
        expect(loaded.getByToken("keep-me")).not.toBeNull();
    });

    it("keeps the tokens of the whole timeline, which is what a rewind is rebuilt from", () => {
        const mgr = createManager();
        ["t1", "t2", "t3"].forEach((token, i) => mgr.push({
            token,
            action: action(`a-${i + 1}`),
            element: { type: "say", text: token, voice: null, character: null },
            snapshot: snapshot(token),
        }));

        expect(mgr.serializeAll().map(e => e.token)).toEqual(["t1", "t2", "t3"]);
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

/**
 * Backward and forward are one timeline with a play head on it: everything up to the head is the
 * backlog, everything past it is a future the player already read and can step into again.
 */
describe("GameHistoryManager play head", () => {
    const line = (token: string, act: Action, snap = token) => ({
        token,
        action: act,
        element: { type: "say" as const, text: token, voice: null, character: null },
        snapshot: snapshot(snap),
    });

    function threeLines() {
        const mgr = createManager();
        const actions = [action("a-1"), action("a-2"), action("a-3")];
        actions.forEach((a, i) => mgr.push(line(`t${i + 1}`, a)));
        return { mgr, actions };
    }

    it("splits the timeline at the play head", () => {
        const { mgr } = threeLines();
        expect(mgr.getHistory().map(h => h.token)).toEqual(["t1", "t2", "t3"]);
        expect(mgr.getFuture()).toEqual([]);

        mgr.setCursor(0);

        // The backlog is what has been read *to here*; showing t2 and t3 in it would be reporting
        // lines the game has not reached in its current state.
        expect(mgr.getHistory().map(h => h.token)).toEqual(["t1"]);
        expect(mgr.getFuture().map(h => h.token)).toEqual(["t2", "t3"]);
    });

    it("knows which way it can move", () => {
        const { mgr } = threeLines();
        expect(mgr.canUndo()).toBe(true);
        expect(mgr.canRedo()).toBe(false);

        mgr.setCursor(0);
        expect(mgr.canUndo()).toBe(false);
        expect(mgr.canRedo()).toBe(true);
    });

    it("keeps the future when play retraces the same line", () => {
        const { mgr, actions } = threeLines();
        mgr.setCursor(0);

        // Reading forward again over the same action: the same line, reached a second time.
        mgr.push(line("t2-again", actions[1]));

        // It keeps the token it already had — a caller holding a reference to that line of the story
        // should not lose it just because the player read past it twice.
        expect(mgr.getHistory().map(h => h.token)).toEqual(["t1", "t2"]);
        // And t3 still stands, so a player who stepped back and read forward can keep stepping
        // forward rather than losing the rest of what they had read.
        expect(mgr.getFuture().map(h => h.token)).toEqual(["t3"]);
    });

    it("treats the first line after a rewind as the current one running again", () => {
        const { mgr, actions } = threeLines();
        mgr.setCursor(1);

        // A line's snapshot is taken as it is reached, before it runs, so resuming from a rewind
        // re-runs that very line. Counting it as a new arrival would push the play head forward a
        // line the player never read on to, and treating it as divergence would drop t3.
        mgr.push(line("t2-rerun", actions[1]));

        expect(mgr.getCursor()).toBe(1);
        expect(mgr.getHistory().map(h => h.token)).toEqual(["t1", "t2"]);
        expect(mgr.getFuture().map(h => h.token)).toEqual(["t3"]);

        // And the line after it arrives as the one ahead, so the retrace carries on.
        mgr.push(line("t3-again", actions[2]));
        expect(mgr.getCursor()).toBe(2);
        expect(mgr.getFuture()).toEqual([]);
    });

    it("drops the future when the story goes somewhere else", () => {
        const { mgr } = threeLines();
        mgr.setCursor(0);

        // A different action: the other side of a choice, say. The recorded future no longer follows
        // from where the story now is, so keeping it would offer the player a future that is not
        // theirs.
        mgr.push(line("t9", action("a-9")));

        expect(mgr.getHistory().map(h => h.token)).toEqual(["t1", "t9"]);
        expect(mgr.getFuture()).toEqual([]);
        expect(mgr.canRedo()).toBe(false);
    });

    it("opens a loaded save on its last line, with nothing ahead", () => {
        const { mgr } = threeLines();
        mgr.setCursor(1);

        const saved = mgr.serialize();
        const loaded = createManager();
        loaded.load(saved, new Map<string, Action>([["a-1", action("a-1")], ["a-2", action("a-2")]]));

        expect(loaded.getHistory()).toHaveLength(2);
        expect(loaded.getFuture()).toEqual([]);
        expect(loaded.canRedo()).toBe(false);
        expect(loaded.canUndo()).toBe(true);
    });

    it("does not list the save's last line twice when the load re-runs it", () => {
        const { mgr, actions } = threeLines();

        const saved = mgr.serialize();
        const loaded = createManager();
        loaded.load(saved, new Map<string, Action>(actions.map(a => [a.getId(), a])));

        // `LiveGame.deserialize` ends by stepping the stack it just restored, and that stack was
        // saved sitting on the line the save was written at - so that line runs again and is pushed
        // again. It is the same arrival, not a new one.
        loaded.push(line("t3-rerun", actions[2]!));

        expect(loaded.getCursor()).toBe(2);
        expect(loaded.getHistory().map(h => h.element.text)).toEqual(["t1", "t2", "t3-rerun"]);
        expect(loaded.getFuture()).toEqual([]);
    });

    it("keeps the token of the line a load re-runs, so a backlog reference survives the load", () => {
        const { mgr, actions } = threeLines();
        const loaded = createManager();
        loaded.load(mgr.serialize(), new Map<string, Action>(actions.map(a => [a.getId(), a])));

        loaded.push(line("t3-rerun", actions[2]!));
        expect(loaded.getHistory().map(h => h.token)).toEqual(["t1", "t2", "t3"]);
    });

    it("still records a genuinely new line after a load", () => {
        const { mgr, actions } = threeLines();
        const loaded = createManager();
        loaded.load(mgr.serialize(), new Map<string, Action>(actions.map(a => [a.getId(), a])));

        // The stack resumed somewhere else entirely. Nothing to reconcile: this is the story moving
        // on, and the backlog grows.
        loaded.push(line("t4", action("a-4")));
        expect(loaded.getHistory().map(h => h.token)).toEqual(["t1", "t2", "t3", "t4"]);
    });

    it("moves the play head along when the action history's cap trims the front", () => {
        const { mgr } = threeLines();
        mgr.setCursor(2);

        // The cap drops the oldest entries; without moving the head with them it would come to rest
        // on a different line than the one the game is on.
        mgr.getHistory();
        (mgr as unknown as { crossFilter(a: { id: string }[]): void }).crossFilter([{ id: "t1" }]);

        expect(mgr.getHistory().map(h => h.token)).toEqual(["t2", "t3"]);
        expect(mgr.getCursor()).toBe(1);
        expect(mgr.getFuture()).toEqual([]);
    });
});
