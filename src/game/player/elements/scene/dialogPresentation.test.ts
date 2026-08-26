import { describe, expect, it } from "vitest";
import {
    DialogPresenceState,
    DialogRenderItem,
    DialogSource,
    resolveDialogPresentation,
} from "./dialogPresentation";

/**
 * What one scene's dialog layer renders, and whether it takes the pointer.
 *
 * Every scene on the stage has a layer of its own, each one covers the whole stage, and a scene
 * parked behind a returnable jump keeps its layer for as long as it is parked. So during a scene
 * call the topmost layer is routinely one belonging to a scene with nothing at all to show, drawn
 * over the box of the scene the story is in.
 *
 * The two rules below are what keep a line that is still waiting reachable in that situation: it is
 * always rendered live, and a layer with nothing live in it does not stand between the player and
 * the box underneath.
 *
 * There is no React harness in this repo, so the decision is a pure function and this exercises it
 * directly. What it cannot cover is the wiring - that the component feeds it the scene's real
 * `texts` and applies the result - which is left to the real machine.
 */

function presence(): DialogPresenceState {
    return {
        slotKeys: new Map(),
        exitingKeys: new Set(),
        menuPromptIds: new WeakMap(),
        nextKey: 0,
    };
}

function line(id: string, slot: number = 0): DialogSource {
    return {
        action: { sentence: null, character: null, words: null, id },
        slot,
        useTypeEffect: true,
        onFinished: () => void 0,
    };
}

function resolve(input: Partial<Parameters<typeof resolveDialogPresentation>[0]> = {}) {
    return resolveDialogPresentation({
        sources: [],
        menuCount: 0,
        presence: presence(),
        retained: null,
        lastActive: [],
        sceneId: "corridor",
        ...input,
    });
}

/** The snapshot a finished line leaves behind, as the layer holds it during the grace. */
function retainedSnapshot(id: string, slot: number = 0): DialogRenderItem[] {
    return [{
        action: { sentence: null, character: null, words: null, id },
        slot,
        useTypeEffect: true,
        presenceKey: `say-corridor-${slot}`,
        active: false,
    }];
}

describe("a line that is still waiting", () => {
    it("is rendered live", () => {
        const result = resolve({ sources: [line("a")] });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].active).toBe(true);
        expect(result.items[0].action.id).toBe("a");
    });

    it("is rendered live even when a snapshot of the previous line is still being held", () => {
        // The grace is a hold on a line that is *over*. A scene that has something to say again
        // takes its box back on the spot, whatever came and went over it in between.
        const result = resolve({
            sources: [line("b")],
            retained: retainedSnapshot("a"),
            lastActive: retainedSnapshot("a"),
        });

        expect(result.retained).toBeNull();
        expect(result.retaining).toBe(false);
        expect(result.items.map(item => [item.action.id, item.active])).toEqual([["b", true]]);
    });

    it("keeps the pointer on its own layer", () => {
        expect(resolve({ sources: [line("a")] }).interactive).toBe(true);
    });
});

describe("a layer with nothing live in it", () => {
    it("does not take the pointer when the scene has nothing to show", () => {
        // A caller parked behind a returnable jump. Its layer is drawn over the called scene's box,
        // so taking the pointer here is taking every click meant for the line the player is reading.
        expect(resolve().interactive).toBe(false);
    });

    it("does not take the pointer while it is only holding a finished line", () => {
        const result = resolve({ lastActive: retainedSnapshot("a") });

        expect(result.items.map(item => item.active)).toEqual([false]);
        expect(result.retaining).toBe(true);
        expect(result.interactive).toBe(false);
    });

    it("still takes the pointer for a menu, which is the player's to click", () => {
        expect(resolve({ menuCount: 1 }).interactive).toBe(true);
    });
});

describe("holding a finished line", () => {
    it("takes a snapshot of the last live items and marks them inactive", () => {
        const result = resolve({ lastActive: retainedSnapshot("a") });

        expect(result.retained).not.toBeNull();
        expect(result.retained!.map(item => [item.action.id, item.active])).toEqual([["a", false]]);
        expect(result.items).toBe(result.retained);
    });

    it("holds nothing when the scene has never said anything", () => {
        const result = resolve();

        expect(result.items).toEqual([]);
        expect(result.retained).toBeNull();
        expect(result.retaining).toBe(false);
    });

    it("keeps the snapshot it already has rather than taking a second one", () => {
        const held = retainedSnapshot("a");
        const result = resolve({ retained: held, lastActive: retainedSnapshot("b") });

        expect(result.retained).toBe(held);
    });
});

describe("the box a line is given", () => {
    it("is the same box when a line is replaced in the same slot", () => {
        const shared = presence();
        const first = resolveDialogPresentation({
            sources: [line("a")], menuCount: 0, presence: shared,
            retained: null, lastActive: [], sceneId: "corridor",
        });
        const second = resolveDialogPresentation({
            sources: [line("b")], menuCount: 0, presence: shared,
            retained: null, lastActive: first.items, sceneId: "corridor",
        });

        expect(second.items[0].presenceKey).toBe(first.items[0].presenceKey);
    });

    it("is a fresh box when the previous one is still animating out", () => {
        const shared = presence();
        const first = resolveDialogPresentation({
            sources: [line("a")], menuCount: 0, presence: shared,
            retained: null, lastActive: [], sceneId: "corridor",
        });
        shared.exitingKeys.add(first.items[0].presenceKey);

        const second = resolveDialogPresentation({
            sources: [line("b")], menuCount: 0, presence: shared,
            retained: null, lastActive: first.items, sceneId: "corridor",
        });

        expect(second.items[0].presenceKey).not.toBe(first.items[0].presenceKey);
    });

    it("is retired when its slot goes away, so the next line in it starts clean", () => {
        const shared = presence();
        const first = resolveDialogPresentation({
            sources: [line("a", 0), line("b", 1)], menuCount: 0, presence: shared,
            retained: null, lastActive: [], sceneId: "corridor",
        });
        const secondSlotKey = first.items[1].presenceKey;

        resolveDialogPresentation({
            sources: [line("a", 0)], menuCount: 0, presence: shared,
            retained: null, lastActive: first.items, sceneId: "corridor",
        });

        expect(shared.exitingKeys.has(secondSlotKey)).toBe(true);
        expect(shared.slotKeys.has(1)).toBe(false);
    });
});
