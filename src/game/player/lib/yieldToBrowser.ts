/**
 * Hand a callback to the next turn of the event loop, without a timer.
 *
 * Exists because two different things need to be true at once, and `setTimeout(fn, 0)` only manages
 * one of them:
 *
 * - It has to be a **task**, not a microtask. React counts commits that leave synchronous work
 *   pending on the same root, and throws `Maximum update depth exceeded` at fifty of them - so a
 *   chain of work driven out of mount effects has to return to the event loop to reset that count.
 *   Microtasks drain before the loop turns and would not.
 * - It must not be a **timer**. A window that is not the foreground one has its timers throttled to
 *   roughly one a second by the browser, so a chain of fifty `setTimeout(0)` hand-overs takes about
 *   fifty seconds in a background window and milliseconds in a focused one. Measured 2026-09-04:
 *   starting a scene of 44 images this way timed the boot preload out at 45s.
 *
 * A `MessageChannel` message is a task and is not a timer, which is the same reason React's own
 * scheduler reaches for one. The `setTimeout` fallback is for hosts that have no `MessageChannel`
 * (a plain Node test run, say), where throttling is not a thing either.
 *
 * The returned function cancels the hand-over if it has not happened yet.
 */
export function yieldToBrowser(callback: () => void): () => void {
    if (typeof MessageChannel === "undefined") {
        const timer = setTimeout(callback, 0);
        return () => clearTimeout(timer);
    }

    let cancelled = false;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        if (!cancelled) {
            callback();
        }
    };
    channel.port2.postMessage(undefined);

    return () => {
        cancelled = true;
    };
}
