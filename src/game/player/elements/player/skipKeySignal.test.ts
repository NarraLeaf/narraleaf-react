import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkipKeySignal } from "./skipKeySignal";

/**
 * A tap of the skip key and a hold of it are different requests.
 *
 * The key only reports down and up, so the difference is made here: the press is one advance - the
 * same one a click produces - and only what arrives while the key is still down is the skip mode.
 * A tap that forced was the whole of the reported fault: it walked past the pauses in the line it
 * was aimed at, and told the scene the line had been skipped, which stopped every line after it
 * from typing.
 *
 * Timers only, no DOM: the announcer keeps the window listeners and the key matching.
 */

function collect(options: { delay: number; interval: number }) {
    const requests: boolean[] = [];
    const signal = new SkipKeySignal(forced => requests.push(forced), options);
    return { requests, signal };
}

describe("SkipKeySignal", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("makes a tap one unforced advance", () => {
        const { requests, signal } = collect({ delay: 0, interval: 100 });

        signal.press();
        signal.release();
        vi.advanceTimersByTime(1000);

        expect(requests).toEqual([false]);
    });

    it("does not repeat a press the OS is echoing", () => {
        // Holding a key makes the platform fire key-down over and over; every one after the first is
        // the same press, and answering them would turn a hold into a burst of separate advances.
        const { requests, signal } = collect({ delay: 0, interval: 100 });

        signal.press();
        signal.press();
        signal.press();

        expect(requests).toEqual([false]);
        expect(signal.isHeld()).toBe(true);
    });

    it("turns a hold into the skip mode", () => {
        const { requests, signal } = collect({ delay: 0, interval: 100 });

        signal.press();
        vi.advanceTimersByTime(250);

        expect(requests).toEqual([false, true, true]);
    });

    it("waits out the configured delay before the mode starts", () => {
        const { requests, signal } = collect({ delay: 500, interval: 100 });

        signal.press();
        vi.advanceTimersByTime(450);
        expect(requests).toEqual([false]);

        vi.advanceTimersByTime(250);
        expect(requests).toEqual([false, true, true]);
    });

    it("stops the mode when the key comes up", () => {
        const { requests, signal } = collect({ delay: 0, interval: 100 });

        signal.press();
        vi.advanceTimersByTime(250);
        signal.release();
        vi.advanceTimersByTime(1000);

        expect(requests).toEqual([false, true, true]);
        expect(signal.isHeld()).toBe(false);
    });

    it("treats the next press as a fresh tap", () => {
        const { requests, signal } = collect({ delay: 0, interval: 100 });

        signal.press();
        signal.release();
        signal.press();
        signal.release();
        vi.advanceTimersByTime(1000);

        expect(requests).toEqual([false, false]);
    });

    it("drops a press that was never released when the player goes away", () => {
        // A window that loses focus mid-press never delivers the key-up. Left running, the interval
        // would go on advancing a game nobody is looking at.
        const { requests, signal } = collect({ delay: 0, interval: 100 });

        signal.press();
        vi.advanceTimersByTime(100);
        signal.dispose();
        vi.advanceTimersByTime(1000);

        expect(requests).toEqual([false, true]);
    });

    it("drops a press that is still waiting out its delay", () => {
        const { requests, signal } = collect({ delay: 500, interval: 100 });

        signal.press();
        vi.advanceTimersByTime(100);
        signal.dispose();
        vi.advanceTimersByTime(5000);

        expect(requests).toEqual([false]);
    });
});
