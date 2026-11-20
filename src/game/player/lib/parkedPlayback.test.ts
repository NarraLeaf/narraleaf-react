import {describe, expect, it, vi} from "vitest";
import {ParkedPlayback, PlayableElement} from "./parkedPlayback";

/**
 * A scene parked behind a call pauses its clips and overlays with its music, and they move again
 * where they stopped when the call returns.
 *
 * Before this a parked scene's clip was only hidden: a clip run without waiting for it, still playing
 * when the call was made, played its sound to the end over the scene that had been called.
 */

function element(playing: boolean) {
    const el = {
        paused: !playing,
        ended: false,
        pause: vi.fn(() => {
            el.paused = true;
        }),
        play: vi.fn(async () => {
            el.paused = false;
        }),
    };
    return el;
}

function parkedPlayback(el: PlayableElement | null) {
    return new ParkedPlayback(() => el, () => void 0);
}

describe("ParkedPlayback", () => {
    it("pauses a playing element when its scene is parked, and plays it again on the return", () => {
        const el = element(true);
        const parking = parkedPlayback(el);

        parking.setParked(true);
        expect(el.pause).toHaveBeenCalledTimes(1);
        expect(el.paused).toBe(true);

        parking.setParked(false);
        expect(el.play).toHaveBeenCalledTimes(1);
    });

    it("leaves an element the story had stopped stopped across the call", () => {
        const el = element(false);
        const parking = parkedPlayback(el);

        parking.setParked(true);
        parking.setParked(false);
        expect(el.pause).not.toHaveBeenCalled();
        expect(el.play).not.toHaveBeenCalled();
    });

    it("leaves an element that had played to its end where it ended", () => {
        const el = element(true);
        el.ended = true;
        const parking = parkedPlayback(el);

        parking.setParked(true);
        parking.setParked(false);
        expect(el.play).not.toHaveBeenCalled();
    });

    it("holds a play asked for while parked until the return", () => {
        const el = element(false);
        const parking = parkedPlayback(el);
        parking.setParked(true);

        // What a clip run without waiting does when a save loaded inside the call asks it to play.
        expect(parking.requestPlay()).toBe(false);
        expect(el.play).not.toHaveBeenCalled();

        parking.setParked(false);
        expect(el.play).toHaveBeenCalledTimes(1);
    });

    it("lets a play through at once when nothing is parked", () => {
        const parking = parkedPlayback(element(false));
        expect(parking.requestPlay()).toBe(true);
    });

    it("forgets the return's play when the story stops the element itself", () => {
        const el = element(true);
        const parking = parkedPlayback(el);
        parking.setParked(true);
        parking.cancel();

        parking.setParked(false);
        expect(el.play).not.toHaveBeenCalled();
    });

    it("does nothing for a state it is already in", () => {
        const el = element(true);
        const parking = parkedPlayback(el);
        parking.setParked(false);
        expect(el.pause).not.toHaveBeenCalled();
        expect(el.play).not.toHaveBeenCalled();
    });
});
