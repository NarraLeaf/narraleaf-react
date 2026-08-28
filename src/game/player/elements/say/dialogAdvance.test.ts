import { describe, expect, it } from "vitest";
import { DialogState } from "./UIDialog";
import { applyDialogAdvance } from "./dialogAdvanceIntent";
import { DialogStateType } from "./type";
import type { GameState } from "@player/gameState";

/**
 * The two faults a player reported, driven against the real dialog state.
 *
 * Both came from the same place. A click on the stage and the skip key reached the box through a
 * dispatcher of their own, which force-skipped a line that was still revealing and settled a
 * revealed one as though the player had been skipping. A click on the box never did either. So:
 *
 *  - a line with a `Pause` in it lost the rest of itself to a single click, because force-skipping
 *    is the one path that walks past pauses; and
 *  - one tap of the skip key on a line that had finished revealing reported that line as skipped,
 *    and the scene carries that answer to the next line as "do not type" - with a menu as its only
 *    way back down.
 *
 * `DialogState` is a plain class and `applyDialogAdvance` is the real dispatcher, so this drives
 * both directly. What it does not cover is which pointer events become an advance (that is
 * `stageClickIntent`) or how the sentence answers `requestComplete` (that is the typewriter's own
 * pause handling, unchanged here).
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

/**
 * A line, wired the way `PlayerDialog` wires one.
 *
 * `asked` is what reached the sentence - `Sentence.tsx` listens for exactly these two events, and
 * which of them arrives is the whole difference between honouring a pause and walking past it.
 * `settled` records the `skiped` flag each settle reported, which is what `SceneDialogs` used to
 * carry to the next line.
 */
function createLine() {
    const dialog = new DialogState({
        useTypeEffect: true,
        action: { sentence: null, character: null, words: null, id: "line-1" },
        evaluatedWords: [],
        gameState: createGameState(),
    });

    const asked: string[] = [];
    const settled: boolean[] = [];
    let isActive = true;

    dialog.events.on(DialogState.Events.requestComplete, () => asked.push("requestComplete"));
    dialog.events.on(DialogState.Events.forceSkip, () => asked.push("forceSkip"));
    dialog.events.on(DialogState.Events.complete, (force?: boolean) => {
        if (!isActive) return;
        if (dialog.isIdle() || force) {
            settled.push(false);
        } else {
            dialog.setIdle(true);
        }
    });
    dialog.setActive(true);

    return {
        dialog,
        asked,
        settled,
        /** A click, on the box or on the stage, or one tap of the skip key. */
        advance: () => applyDialogAdvance(dialog, { active: isActive, forced: false }),
        /** The skip key, held: every repeat after the first press. */
        holdSkip: () => applyDialogAdvance(dialog, { active: isActive, forced: true }),
        /** The typewriter reporting the line fully revealed. */
        finishTyping: () => dialog.dispatchComplete(),
        setActive: (next: boolean) => {
            isActive = next;
            dialog.setActive(next);
        },
    };
}

describe("a click while the line is still revealing", () => {
    it("asks the line to complete rather than forcing it", () => {
        // This is the pause fault. `requestComplete` reaches the typewriter as `interact`, which
        // offers the click to whatever is holding the reveal - a `Pause` takes it and the rest of
        // the line goes on typing. `forceSkip` reaches it as the skip walk, which is written to
        // step over pauses and would put the whole line on screen at once.
        const line = createLine();

        line.advance();

        expect(line.asked).toEqual(["requestComplete"]);
    });

    it("never forces, however many times the player clicks", () => {
        const line = createLine();

        line.advance();
        line.advance();
        line.advance();

        expect(line.asked).toEqual(["requestComplete", "requestComplete", "requestComplete"]);
        expect(line.asked).not.toContain("forceSkip");
    });

    it("does not settle the line it has not revealed yet", () => {
        const line = createLine();

        line.advance();

        expect(line.settled).toEqual([]);
        expect(line.dialog.state).toBe(DialogStateType.Pending);
    });
});

describe("an advance once the line has finished revealing", () => {
    it("settles it, and does not report it as skipped", () => {
        // This is the typewriter fault. The scene reads the reported flag as "the player is
        // skipping" and hands it to the next line as "do not type"; only a menu ever lowered it
        // again. Reading a line and then clicking is not skipping.
        const line = createLine();

        line.finishTyping();
        line.advance();

        expect(line.settled).toEqual([false]);
    });

    it("settles it the same way whether the player clicked or tapped the skip key", () => {
        // The skip key's first press is a tap, and a tap is an advance - it arrives here unforced,
        // exactly as a click does.
        const clicked = createLine();
        clicked.finishTyping();
        clicked.advance();

        const tapped = createLine();
        tapped.finishTyping();
        tapped.advance();

        expect(tapped.settled).toEqual(clicked.settled);
    });
});

describe("the skip key held down", () => {
    it("forces the line, which is what the mode is for", () => {
        const line = createLine();

        line.holdSkip();

        expect(line.asked).toEqual(["forceSkip"]);
        expect(line.dialog.isIdle()).toBe(true);
    });

    it("settles a line it has already forced", () => {
        const line = createLine();

        line.holdSkip();
        line.finishTyping();

        expect(line.settled).toEqual([false]);
    });
});

describe("a box that does not hold the line", () => {
    it("answers neither a click nor the skip mode", () => {
        const line = createLine();
        line.setActive(false);

        line.advance();
        line.holdSkip();

        expect(line.asked).toEqual([]);
        expect(line.settled).toEqual([]);
    });
});
