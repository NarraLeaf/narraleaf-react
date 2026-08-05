import { describe, expect, it } from "vitest";
import { Sound } from "@core/elements/sound";
import { DialogState } from "./UIDialog";
import { DialogStateType } from "./type";

/**
 * Auto-forward against a still-playing voice.
 *
 * The seam, not the component: `DialogState` is constructed by the player and its scheduler is the
 * only observable output, so the test duck-types a state onto the prototype and watches which of the
 * two paths - schedule now, or wait for the clip - `tryScheduleAutoForward` takes. Same idiom as the
 * rest of the repo's tests.
 */

type FakeToken = {
    isPlaying: () => boolean;
    once: (event: string, handler: () => void) => void;
    off: (event: string, handler: () => void) => void;
    /** Fire what `once` registered, the way the sound layer would when the clip ends. */
    end: () => void;
    offCalls: number;
};

function fakeToken(playing: boolean): FakeToken {
    const handlers = new Map<string, Set<() => void>>();
    const token: FakeToken = {
        isPlaying: () => playing,
        once: (event, handler) => {
            const set = handlers.get(event) ?? new Set<() => void>();
            set.add(handler);
            handlers.set(event, set);
        },
        off: (event, handler) => {
            token.offCalls += 1;
            handlers.get(event)?.delete(handler);
        },
        end: () => {
            for (const handler of [...(handlers.get("ended") ?? [])]) {
                handler();
            }
        },
        offCalls: 0,
    };
    return token;
}

type Setup = {
    voice: Sound | null;
    token: FakeToken | null;
    /** Mutable so a test can turn auto off *while* the clip is still playing. */
    preference?: { autoForward: boolean };
    getLastScene?: () => unknown;
};

function makeState(setup: Setup) {
    const scheduled: { delay: number }[] = [];
    const preference = setup.preference ?? { autoForward: true };
    const scheduler = {
        cancelTask() {
            return this;
        },
        scheduleTask(_handler: () => void, delay: number) {
            scheduled.push({ delay });
            return { cancel: () => undefined, isCancelled: () => false };
        },
    };
    const state = Object.create(DialogState.prototype) as DialogState;
    // Written through an untyped view on purpose: everything below is private, and the point of the
    // test is to stand the object up without the player that normally builds it.
    const fields = state as unknown as Record<string, unknown>;
    fields._state = DialogStateType.Ended;
    fields._active = true;
    fields.voiceWaitDisposer = null;
    fields.autoForwardScheduler = scheduler;
    fields.config = {
        action: { sentence: { config: { voiceId: null, voice: setup.voice } } },
        gameState: {
            getLastScene: setup.getLastScene ?? (() => ({ getVoice: () => null })),
            audioManager: { getToken: () => setup.token },
            game: {
                config: { autoForwardDelay: 3000 },
                preference: {
                    getPreference: (key: string) => (key === "autoForward" ? preference.autoForward : 1),
                },
            },
        },
    };
    return { state, scheduled, preference };
}

describe("auto-forward waits for the line's voice", () => {
    it("schedules straight away when the line has no voice", () => {
        const { state, scheduled } = makeState({ voice: null, token: null });

        state.tryScheduleAutoForward();

        expect(scheduled).toEqual([{ delay: 3000 }]);
    });

    it("schedules straight away when the clip has already finished", () => {
        const { state, scheduled } = makeState({ voice: Sound.voice("line.mp3"), token: fakeToken(false) });

        state.tryScheduleAutoForward();

        expect(scheduled).toEqual([{ delay: 3000 }]);
    });

    it("holds the delay until a still-playing clip ends, then applies it", () => {
        const token = fakeToken(true);
        const { state, scheduled } = makeState({ voice: Sound.voice("line.mp3"), token });

        state.tryScheduleAutoForward();
        expect(scheduled).toEqual([]);

        token.end();

        expect(scheduled).toEqual([{ delay: 3000 }]);
        expect(token.offCalls).toBeGreaterThan(0);
    });

    it("drops the wait when auto-forward is cancelled, so a left dialog does not advance later", () => {
        const token = fakeToken(true);
        const { state, scheduled } = makeState({ voice: Sound.voice("line.mp3"), token });

        state.tryScheduleAutoForward();
        state.cancelAutoForward();
        token.end();

        expect(scheduled).toEqual([]);
    });

    it("does not schedule when the player turned auto off while the clip was playing", () => {
        const token = fakeToken(true);
        const { state, scheduled, preference } = makeState({ voice: Sound.voice("line.mp3"), token });

        state.tryScheduleAutoForward();
        preference.autoForward = false;
        token.end();

        expect(scheduled).toEqual([]);
    });

    it("survives a scene that cannot resolve the voice", () => {
        const { state, scheduled } = makeState({
            voice: Sound.voice("line.mp3"),
            token: fakeToken(true),
            getLastScene: () => {
                throw new Error("no scene");
            },
        });

        state.tryScheduleAutoForward();

        expect(scheduled).toEqual([{ delay: 3000 }]);
    });
});
