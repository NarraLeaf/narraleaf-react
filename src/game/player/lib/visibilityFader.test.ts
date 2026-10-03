import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {FadableElement, toCssEasing, VisibilityFader} from "./visibilityFader";

/**
 * The fader is the whole of how a video fades, and it runs without a DOM: it writes four inline
 * style properties and ends on a timer. So the element here is the four properties, and time is
 * vitest's.
 */

function element(): FadableElement {
    return {
        style: {opacity: "", visibility: "", pointerEvents: "", transition: ""},
        offsetWidth: 0,
    };
}

function snapshot(el: FadableElement) {
    const {opacity, visibility, pointerEvents} = el.style;
    return {opacity, visibility, pointerEvents};
}

const SHOWN = {opacity: "1", visibility: "visible", pointerEvents: "auto"};
const HIDDEN = {opacity: "0", visibility: "hidden", pointerEvents: "none"};

describe("VisibilityFader", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows and hides at once without a duration, as an instant show or hide always did", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);

        await fader.fadeTo(true);
        expect(snapshot(el)).toEqual(SHOWN);
        await fader.fadeTo(false, {duration: 0});
        expect(snapshot(el)).toEqual(HIDDEN);
        expect(fader.isFading()).toBe(false);
    });

    it("fades out over the duration, then hides the element", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);
        fader.set(true);

        let done = false;
        void fader.fadeTo(false, {duration: 600}).then(() => (done = true));
        expect(el.style.transition).toBe("opacity 600ms linear");
        expect(el.style.opacity).toBe("0");
        // Still visible while it fades, and out of the pointer's way.
        expect(el.style.visibility).toBe("visible");
        expect(el.style.pointerEvents).toBe("none");
        expect(fader.isFading()).toBe(true);

        await vi.advanceTimersByTimeAsync(599);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toBe(true);
        expect(snapshot(el)).toEqual(HIDDEN);
        expect(el.style.transition).toBe("");
        expect(fader.isFading()).toBe(false);
    });

    it("fades a hidden element in from zero", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);
        fader.set(false);

        const fade = fader.fadeTo(true, {duration: 300, easing: "easeOut"});
        expect(el.style.visibility).toBe("visible");
        expect(el.style.opacity).toBe("1");
        expect(el.style.transition).toBe("opacity 300ms cubic-bezier(0, 0, 0.58, 1)");

        await vi.advanceTimersByTimeAsync(300);
        await fade;
        expect(snapshot(el)).toEqual(SHOWN);
    });

    it("lands a skipped fade on its end state at once", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);
        fader.set(true);

        let done = false;
        void fader.fadeTo(false, {duration: 600}).then(() => (done = true));
        await vi.advanceTimersByTimeAsync(100);
        fader.skip();
        await Promise.resolve();

        expect(done).toBe(true);
        expect(snapshot(el)).toEqual(HIDDEN);
        expect(fader.isFading()).toBe(false);
        // The timer it replaced does not come back to write anything later.
        fader.set(true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(snapshot(el)).toEqual(SHOWN);
    });

    it("leaves a cancelled fade unfinished, for the caller to set", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);
        fader.set(true);

        let done = false;
        void fader.fadeTo(false, {duration: 600}).then(() => (done = true));
        fader.cancel();
        await Promise.resolve();

        expect(done).toBe(true);
        expect(fader.isFading()).toBe(false);
        expect(el.style.visibility).toBe("visible");
        expect(el.style.transition).toBe("");

        fader.set(true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(snapshot(el)).toEqual(SHOWN);
    });

    it("settles a fade in flight when the element goes away", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);
        fader.set(true);

        let done = false;
        void fader.fadeTo(false, {duration: 600}).then(() => (done = true));
        fader.dispose();
        await Promise.resolve();

        expect(done).toBe(true);
        expect(fader.isFading()).toBe(false);
    });

    it("does not spend the duration on an element already where it was asked to go", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);
        fader.set(true);

        let done = false;
        void fader.fadeTo(true, {duration: 600}).then(() => (done = true));
        await Promise.resolve();

        expect(done).toBe(true);
        expect(fader.isFading()).toBe(false);
    });

    it("hands the element to a newer fade, settling the older one without writing its end", async () => {
        const el = element();
        const fader = new VisibilityFader(() => el);
        fader.set(true);

        let firstDone = false;
        void fader.fadeTo(false, {duration: 600}).then(() => (firstDone = true));
        await vi.advanceTimersByTimeAsync(200);
        const second = fader.fadeTo(true, {duration: 300});
        await Promise.resolve();
        expect(firstDone).toBe(true);
        expect(el.style.opacity).toBe("1");

        // The first fade's timer would have fired here and hidden the element.
        await vi.advanceTimersByTimeAsync(300);
        await second;
        expect(snapshot(el)).toEqual(SHOWN);
        await vi.advanceTimersByTimeAsync(1000);
        expect(snapshot(el)).toEqual(SHOWN);
    });
});

describe("toCssEasing", () => {
    it("is linear when nothing is asked for", () => {
        expect(toCssEasing(undefined)).toBe("linear");
    });

    it("spells a bezier and the named curves", () => {
        expect(toCssEasing([0.1, 0.2, 0.3, 0.4])).toBe("cubic-bezier(0.1, 0.2, 0.3, 0.4)");
        expect(toCssEasing("easeInOut")).toBe("cubic-bezier(0.42, 0, 0.58, 1)");
    });

    it("has no answer for a curve CSS cannot draw", () => {
        expect(toCssEasing("circIn" as never)).toBeNull();
    });
});
