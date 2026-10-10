import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pause, type Pausing } from "@core/elements/character/pause";
import { Word } from "@core/elements/character/word";
import type { TextEvent } from "@core/elements/character/textEvent";
import type { Game } from "@core/game";
import { GameState } from "@player/gameState";
import { Timelines } from "@player/Tasks";
import { DialogState } from "./UIDialog";
import { rollSentence } from "./Sentence";

/**
 * A press that reaches a line while its typewriter is not running.
 *
 * The typewriter is a loop scheduled one timer after the line's task is created, and every press
 * that stops it schedules it again one timer later. Between those two moments the line has no
 * loop to answer a press, and a press there used to be read as "the line is finished": a line
 * with a `Pause` in it stopped at the pause, half shown, was reported as ended, and the next
 * press moved on without the rest of it ever being shown.
 *
 * The second gap is not only reached by code that presses for the player. A click on the default
 * dialog box reaches the line twice in the same task - once through the box's own click handler,
 * once through the stage's - so the second half of every click on a line still typing landed in
 * it. Two presses in the same gap therefore count as one: the second stops at the pause the first
 * one stopped at.
 *
 * The loop, the pauses and the timers are the real ones (the timers are faked so the gaps can be
 * held open); the component around the typewriter is replaced by the four things it hands it.
 */

const CPS = 10;
const CHAR_MS = 1000 / CPS;

type Shown = { text: string } | "\n";

function createLine(words: Word<string | Pausing | TextEvent>[]) {
    const preferences: Record<string, unknown> = {
        gameSpeed: 1,
        cps: CPS,
        autoForward: false,
        textRevealDuration: 0,
    };
    const game = {
        preference: {
            getPreference: (key: string) => preferences[key],
            getPreferences: () => preferences,
        },
        config: {
            autoForwardDefaultPause: 1000,
            autoForwardDelay: 0,
        },
    } as unknown as Game;
    const gameState = {
        game,
        guard: undefined,
        timelines: new Timelines(),
        schedule: GameState.prototype.schedule,
        logger: {
            weakWarn: () => void 0,
            warn: () => void 0,
            info: () => void 0,
            log: () => void 0,
            debug: () => void 0,
        },
        completeAdvDialogTyping: () => void 0,
    } as unknown as GameState;

    const dialog = new DialogState({
        useTypeEffect: true,
        action: { sentence: null, character: null, words: null, id: "line-1" } as never,
        evaluatedWords: words,
        gameState,
    });
    // The box listens for the line ending; without a listener `dispatchComplete` refuses to end it.
    dialog.events.on(DialogState.Events.complete, () => void 0);

    let displaying: Shown[] = [];
    const setDisplaying = (next: Shown[] | ((prev: Shown[]) => Shown[])) => {
        displaying = typeof next === "function" ? next(displaying) : next;
    };

    // Created exactly as the component creates it: the typing loop is scheduled, not yet run.
    const task = rollSentence({ game, gameState, dialog, setDisplaying: setDisplaying as never });
    task.onComplete(() => dialog.dispatchComplete());

    return {
        task,
        dialog,
        shown: () => displaying.map((word) => (word === "\n" ? "\n" : word.text)).join(""),
    };
}

function words(...parts: (string | Pausing)[]): Word<string | Pausing | TextEvent>[] {
    return parts.map((part) => new Word<string | Pausing | TextEvent>(part));
}

/** Lets every timer that is due now run, which is what starts or restarts the typing loop. */
async function letTheLoopRun() {
    await vi.advanceTimersByTimeAsync(0);
}

describe("a press while the typewriter is not running", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stops at the pause before the loop has started, and the line is not ended", async () => {
        const { task, dialog, shown } = createLine(words("Hello", Pause, "world"));

        task.interact();

        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        // The loop starts and waits at the pause the press stopped at, for as long as it takes.
        await letTheLoopRun();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        // The next press answers the pause, and the rest of the line is typed out.
        task.interact();
        expect(dialog.isEnded()).toBe(false);
        await vi.advanceTimersByTimeAsync(CHAR_MS * 10);
        expect(shown()).toBe("Helloworld");
        expect(dialog.isEnded()).toBe(true);
    });

    it("stops at the pause when a click lands mid-line and reaches the line twice", async () => {
        const { task, dialog, shown } = createLine(words("Hello", Pause, "world"));

        await letTheLoopRun();
        expect(shown()).toBe("H");

        // One click on the default box: the first delivery stops the running loop at the pause and
        // schedules it again; the second arrives before it has started again.
        task.interact();
        task.interact();

        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        // One click, one advance: the line waits at its pause.
        await letTheLoopRun();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        task.interact();
        await vi.advanceTimersByTimeAsync(CHAR_MS * 10);
        expect(shown()).toBe("Helloworld");
        expect(dialog.isEnded()).toBe(true);
    });

    it("counts two presses before the loop has started as one", async () => {
        const { task, dialog, shown } = createLine(words("Hello", Pause, "world"));

        task.interact();
        task.interact();

        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        await letTheLoopRun();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        task.interact();
        await vi.advanceTimersByTimeAsync(CHAR_MS * 10);
        expect(shown()).toBe("Helloworld");
        expect(dialog.isEnded()).toBe(true);
    });

    it("leaves the ordinary timing as it was: a press mid-line stops at the pause, the next answers it", async () => {
        const { task, dialog, shown } = createLine(words("Hello", Pause, "world"));

        await letTheLoopRun();
        task.interact();
        // The loop starts again and takes the pause up before anything else happens.
        await letTheLoopRun();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        task.interact();
        expect(dialog.isEnded()).toBe(false);
        await vi.advanceTimersByTimeAsync(CHAR_MS * 10);
        expect(shown()).toBe("Helloworld");
        expect(dialog.isEnded()).toBe(true);
    });

    it("waits out a timed pause the press stopped at, then types on", async () => {
        const { task, dialog, shown } = createLine(words("Hello", Pause.wait(500), "world"));

        task.interact();
        expect(shown()).toBe("Hello");
        expect(dialog.isEnded()).toBe(false);

        await letTheLoopRun();
        await vi.advanceTimersByTimeAsync(400);
        expect(shown()).toBe("Hello");

        await vi.advanceTimersByTimeAsync(100 + CHAR_MS * 10);
        expect(shown()).toBe("Helloworld");
        expect(dialog.isEnded()).toBe(true);
    });

    it("still ends a line with no pause at the first press", async () => {
        const { task, dialog, shown } = createLine(words("Hello world"));

        task.interact();

        expect(shown()).toBe("Hello world");
        expect(dialog.isEnded()).toBe(true);
    });

    it("still walks a forced skip past every pause before the loop has started", async () => {
        const { task, dialog, shown } = createLine(words("Hello", Pause, "world"));

        task.forceSkip();

        expect(shown()).toBe("Helloworld");
        expect(dialog.isEnded()).toBe(true);
    });

    it("still walks a forced skip past a pause an earlier press stopped at", async () => {
        const { task, dialog, shown } = createLine(words("Hello", Pause, "world"));

        task.interact();
        task.forceSkip();

        expect(shown()).toBe("Helloworld");
        expect(dialog.isEnded()).toBe(true);
    });
});
