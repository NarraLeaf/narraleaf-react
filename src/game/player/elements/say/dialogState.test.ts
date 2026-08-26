import { describe, expect, it } from "vitest";
import { DialogState } from "./UIDialog";
import { DialogStateType } from "./type";
import type { GameState } from "@player/gameState";

/**
 * The latch between "the line has finished revealing" and "the next click settles it".
 *
 * A dialog box is active while it is showing a line the player still has to answer, and inactive
 * while it is a picture of a line that is over - which is also what it is for the moment another
 * scene's box is drawn over it, or a panel is opened on top of the stage. An inactive box ignores
 * clicks on purpose.
 *
 * The latch is `isIdle`. It used to be set only by the box that happened to be active at the instant
 * the text finished revealing, so a line that finished while its box was displaced came back with
 * the latch down and no way to raise it except by spending clicks on it. It now follows the fact -
 * the text is fully revealed - rather than who was watching when it happened.
 *
 * `DialogState` is a plain class, so this drives it directly; the React half (which box is active
 * when) is left to the real machine.
 */

function createGameState(): GameState {
    return {
        logger: {
            weakWarn: () => void 0,
            log: () => void 0,
            debug: () => void 0,
        },
        completeAdvDialogTyping: () => void 0,
        game: {
            preference: {
                getPreference: () => false,
            },
            config: {
                autoForwardDelay: 0,
            },
        },
    } as unknown as GameState;
}

function createDialog() {
    return new DialogState({
        useTypeEffect: true,
        action: { sentence: null, character: null, words: null, id: "line-1" },
        evaluatedWords: [],
        gameState: createGameState(),
    });
}

/**
 * The box, as `PlayerDialog` wires it: a `complete` listener that does nothing while its box is
 * inactive, and the active flag the dialog state reads for itself.
 */
function attachBox(dialog: DialogState, active: boolean) {
    let isActive = active;
    let finished = 0;

    dialog.events.on(DialogState.Events.complete, (force?: boolean) => {
        if (!isActive) return;
        if (dialog.isIdle() || force) {
            finished++;
        } else {
            dialog.setIdle(true);
        }
    });
    dialog.setActive(active);

    return {
        finishedCount: () => finished,
        setActive: (next: boolean) => {
            isActive = next;
            dialog.setActive(next);
        },
    };
}

describe("a line whose box is live the whole way through", () => {
    it("is idle once its text has finished revealing", () => {
        const dialog = createDialog();
        attachBox(dialog, true);

        dialog.dispatchComplete();

        expect(dialog.state).toBe(DialogStateType.Ended);
        expect(dialog.isIdle()).toBe(true);
    });

    it("settles on the next advance", () => {
        const dialog = createDialog();
        const box = attachBox(dialog, true);

        dialog.dispatchComplete();
        dialog.requestComplete();

        expect(box.finishedCount()).toBe(1);
    });
});

describe("a line whose box was displaced while it finished revealing", () => {
    it("is idle again the moment its box is live", () => {
        const dialog = createDialog();
        const box = attachBox(dialog, true);

        // Another scene's dialog takes the box, or a panel opens over the stage.
        box.setActive(false);
        dialog.dispatchComplete();
        expect(dialog.isIdle()).toBe(false);

        box.setActive(true);

        expect(dialog.isIdle()).toBe(true);
    });

    it("settles on the first advance after that, not the second", () => {
        const dialog = createDialog();
        const box = attachBox(dialog, true);

        box.setActive(false);
        dialog.dispatchComplete();
        box.setActive(true);

        dialog.requestComplete();

        expect(box.finishedCount()).toBe(1);
    });
});

describe("a line that has not finished revealing", () => {
    it("is not made idle by its box coming back", () => {
        // The latch says the text is fully on screen. A box that reappears over a half-typed line
        // must still reveal the rest of it before a click can settle the line.
        const dialog = createDialog();
        const box = attachBox(dialog, true);

        box.setActive(false);
        box.setActive(true);

        expect(dialog.state).toBe(DialogStateType.Pending);
        expect(dialog.isIdle()).toBe(false);
    });

    it("ignores an advance while its box is inactive", () => {
        const dialog = createDialog();
        const box = attachBox(dialog, true);

        box.setActive(false);
        dialog.requestComplete();
        dialog.forceSkip();

        expect(box.finishedCount()).toBe(0);
        expect(dialog.state).toBe(DialogStateType.Pending);
    });
});
