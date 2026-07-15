import { describe, expect, it, vi } from "vitest";
import { EventDispatcher } from "@lib/util/data";
import { GameState, type NvlState } from "@player/gameState";
import { DevTools } from "./DevTools";

/**
 * Duck-typed GameState carrying only the members the ADV dialog tracking and
 * DevTools dialog readers touch; prototype methods are reused so the real
 * implementations are what gets exercised.
 */
function createStateLike(overrides: { nvl?: Partial<NvlState> } = {}) {
    const nvlState: NvlState = {
        active: false,
        visible: false,
        sessionId: null,
        dialogs: [],
        options: null,
        activeDialogId: null,
        phase: "idle",
        pendingAdvance: false,
        isTyping: false,
        ...overrides.nvl,
    };
    const state = {
        events: new EventDispatcher(),
        advDialogState: null,
        isNvlMode: () => nvlState.active,
        getNvlState: () => nvlState,
        getNvlDialog: (id: string) => nvlState.dialogs.find(dialog => dialog.id === id) || null,
        beginAdvDialog: GameState.prototype.beginAdvDialog,
        completeAdvDialogTyping: GameState.prototype.completeAdvDialogTyping,
        settleAdvDialog: GameState.prototype.settleAdvDialog,
        getAdvDialogState: GameState.prototype.getAdvDialogState,
    };
    return state as unknown as GameState;
}

describe("GameState ADV dialog tracking", () => {
    it("tracks begin → typing complete → settle with change events", () => {
        const state = createStateLike();
        const listener = vi.fn();
        state.events.on(GameState.EventTypes["event:state.dialog.change"], listener);

        state.beginAdvDialog("d-1", "studio:action-1");
        expect(state.getAdvDialogState()).toEqual({ dialogId: "d-1", actionId: "studio:action-1", ended: false });
        expect(listener).toHaveBeenCalledTimes(1);

        // Mismatched dialog id (e.g. a foreign DialogState) is a no-op.
        state.completeAdvDialogTyping("other");
        expect(state.getAdvDialogState()?.ended).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);

        state.completeAdvDialogTyping("d-1");
        expect(state.getAdvDialogState()?.ended).toBe(true);
        expect(listener).toHaveBeenCalledTimes(2);

        // Duplicate completion does not re-emit.
        state.completeAdvDialogTyping("d-1");
        expect(listener).toHaveBeenCalledTimes(2);

        state.settleAdvDialog("other");
        expect(state.getAdvDialogState()).not.toBeNull();

        state.settleAdvDialog("d-1");
        expect(state.getAdvDialogState()).toBeNull();
        expect(listener).toHaveBeenCalledTimes(3);
    });
});

describe("DevTools dialog readers", () => {
    it("reads the tracked ADV dialog", () => {
        const state = createStateLike();
        expect(DevTools.getCurrentDialog(state)).toBeNull();

        state.beginAdvDialog("d-1", "studio:action-1");
        expect(DevTools.getCurrentDialog(state)).toEqual({ actionId: "studio:action-1", ended: false, mode: "adv" });

        state.completeAdvDialogTyping("d-1");
        expect(DevTools.getCurrentDialog(state)).toEqual({ actionId: "studio:action-1", ended: true, mode: "adv" });

        state.settleAdvDialog("d-1");
        expect(DevTools.getCurrentDialog(state)).toBeNull();
    });

    it("reads the active NVL dialog with awaitAdvance as ended", () => {
        const entry = { id: "n-1", actionId: "studio:action-2", character: null, sentence: null as never, text: "hi" };
        const typing = createStateLike({
            nvl: { active: true, dialogs: [entry], activeDialogId: "n-1", phase: "typing" },
        });
        expect(DevTools.getCurrentDialog(typing)).toEqual({ actionId: "studio:action-2", ended: false, mode: "nvl" });

        const ended = createStateLike({
            nvl: { active: true, dialogs: [entry], activeDialogId: "n-1", phase: "awaitAdvance" },
        });
        expect(DevTools.getCurrentDialog(ended)).toEqual({ actionId: "studio:action-2", ended: true, mode: "nvl" });

        const idle = createStateLike({ nvl: { active: true, dialogs: [entry], activeDialogId: null } });
        expect(DevTools.getCurrentDialog(idle)).toBeNull();
    });

    it("aggregates ADV and NVL change events in onDialogStateChange", () => {
        const state = createStateLike();
        const listener = vi.fn();
        const token = DevTools.onDialogStateChange(state, listener);

        state.beginAdvDialog("d-1", null);
        expect(listener).toHaveBeenCalledTimes(1);

        state.events.emit(GameState.EventTypes["event:state.nvl.change"], state.getNvlState());
        expect(listener).toHaveBeenCalledTimes(2);

        token.cancel();
        state.beginAdvDialog("d-2", null);
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
