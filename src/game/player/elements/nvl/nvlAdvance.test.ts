import { describe, expect, it } from "vitest";
import { applyNvlAdvance, NvlAdvancePage } from "./nvlAdvance";
import { DialogState } from "../say/UIDialog";
import type { GameState } from "@player/gameState";

/**
 * One advance of an NVL line.
 *
 * The fault this pins is the skip key: it forced on every emission, so a single tap of it walked
 * straight past a `Pause` in the line it landed on, while a click on the same line honoured it.
 * ADV had the same fault and the same rule fixes both; what is NVL's own is the order - the page
 * moves first, and only a line still revealing is the dialog's to answer.
 *
 * Driven against a real `DialogState` and a page stub, so what is asserted is which event actually
 * reached the sentence.
 */

function createGameState(): GameState {
    return {
        logger: { weakWarn: () => void 0, log: () => void 0, debug: () => void 0 },
        completeAdvDialogTyping: () => void 0,
        game: { preference: { getPreference: () => false }, config: { autoForwardDelay: 0 } },
    } as unknown as GameState;
}

function createDialog() {
    const dialog = new DialogState({
        useTypeEffect: true,
        action: { sentence: null, character: null, words: null, id: "nvl-1" },
        evaluatedWords: [],
        gameState: createGameState(),
    });
    const asked: string[] = [];
    dialog.events.on(DialogState.Events.requestComplete, () => asked.push("requestComplete"));
    dialog.events.on(DialogState.Events.forceSkip, () => asked.push("forceSkip"));
    dialog.setActive(true);
    return { dialog, asked };
}

function createPage(answer: "ignore" | "typing" | "advance"): NvlAdvancePage & { calls: string[] } {
    const calls: string[] = [];
    return { calls, requestNvlAdvance(id: string) { calls.push(id); return answer; } };
}

describe("a line still revealing", () => {
    it("is asked to complete by a click or a tap of the skip key", () => {
        const { dialog, asked } = createDialog();
        const page = createPage("typing");

        const result = applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: true, forced: false });

        expect(result).toBe("requestComplete");
        expect(asked).toEqual(["requestComplete"]);
    });

    it("is forced only by the skip mode", () => {
        const { dialog, asked } = createDialog();
        const page = createPage("typing");

        const result = applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: true, forced: true });

        expect(result).toBe("forceSkip");
        expect(asked).toEqual(["forceSkip"]);
    });

    it("never forces on an unforced advance, however many arrive", () => {
        // The pause fault: forcing is the one path written to step over a `Pause`, so a tap of the
        // skip key used to spend a pause the player was never offered.
        const { dialog, asked } = createDialog();
        const page = createPage("typing");

        applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: true, forced: false });
        applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: true, forced: false });

        expect(asked).not.toContain("forceSkip");
    });
});

describe("the page's own move", () => {
    it("happens before anything is decided about the line", () => {
        // `requestNvlAdvance` settles a line that has finished revealing; asking it is the advance.
        const { dialog, asked } = createDialog();
        const page = createPage("advance");

        const result = applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: true, forced: false });

        expect(page.calls).toEqual(["nvl-1"]);
        expect(result).toBe("pageHandled");
        expect(asked).toEqual([]);
    });

    it("is made by the skip mode too", () => {
        const { dialog, asked } = createDialog();
        const page = createPage("advance");

        applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: true, forced: true });

        expect(page.calls).toEqual(["nvl-1"]);
        expect(asked).toEqual([]);
    });

    it("leaves a line the page will not answer for alone", () => {
        const { dialog, asked } = createDialog();
        const page = createPage("ignore");

        expect(applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: true, forced: false }))
            .toBe("pageHandled");
        expect(asked).toEqual([]);
    });
});

describe("a dialog that does not hold the line", () => {
    it("does not move the page and does not answer", () => {
        const { dialog, asked } = createDialog();
        const page = createPage("typing");

        const result = applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: false, forced: false });

        expect(result).toBe("ignore");
        expect(page.calls).toEqual([]);
        expect(asked).toEqual([]);
    });

    it("is not moved by the skip mode either", () => {
        const { dialog, asked } = createDialog();
        const page = createPage("typing");

        applyNvlAdvance(page, dialog, { dialogId: "nvl-1", active: false, forced: true });

        expect(page.calls).toEqual([]);
        expect(asked).toEqual([]);
    });
});
