import { describe, expect, it, vi } from "vitest";
import { Sound } from "@core/elements/sound";
import { setSceneBackgroundMusic } from "./backgroundMusic";

/** Let the awaits inside the transition run without settling anything that is still pending. */
async function tick(): Promise<void> {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
}

/** A fade-out this test decides when to finish, standing in for `AudioManager.stop`'s awaitable. */
function pendingFade() {
    let finish!: () => void;
    const promise = new Promise<void>(resolve => {
        finish = resolve;
    });
    return { promise, finish };
}

function audioManager(fade: { promise: Promise<void> }, managed = true) {
    const order: string[] = [];
    const stop = vi.fn(() => {
        order.push("stop");
        return fade.promise;
    });
    const playSoundToken = vi.fn(async () => {
        order.push("play");
        return {};
    });
    return {
        order,
        stop,
        playSoundToken,
        state: {
            audioManager: { isManaged: () => managed, stop, playSoundToken },
        },
    };
}

/**
 * A cross-fade is the two tracks overlapping. Sequencing them - fade the old one out, *then* start
 * the new one - leaves a hole of `fade` milliseconds of silence between two pieces of music that
 * were supposed to blend into each other.
 */
describe("setSceneBackgroundMusic", () => {
    it("starts the incoming track before the outgoing fade-out has finished", async () => {
        const outgoing = Sound.bgm("old.mp3");
        const incoming = Sound.bgm("new.mp3");
        const fade = pendingFade();
        const manager = audioManager(fade);
        const scene = { state: { backgroundMusic: outgoing } };

        let settled = false;
        const done = setSceneBackgroundMusic(manager.state as never, scene as never, incoming, 500)
            .then(() => {
                settled = true;
            });
        await tick();

        expect(manager.stop).toHaveBeenCalledWith(outgoing, 500);
        expect(manager.playSoundToken).toHaveBeenCalled();
        expect(manager.order).toEqual(["stop", "play"]);
        // The caller (`SceneAction.initBackgroundMusic`) is entitled to assume the previous track is
        // gone by the time this resolves, so overlapping must not shorten the wait either.
        expect(settled).toBe(false);

        fade.finish();
        await done;

        expect(settled).toBe(true);
        expect(scene.state.backgroundMusic).toBe(incoming);
    });

    it("restarts the same clip only once its own fade-out has finished", async () => {
        const track = Sound.bgm("theme.mp3");
        const fade = pendingFade();
        const manager = audioManager(fade);
        const scene = { state: { backgroundMusic: track } };

        const done = setSceneBackgroundMusic(manager.state as never, scene as never, track, 500);
        await tick();

        // `AudioManager` keys its state by the sound element, so a restart that overlapped its own
        // fade-out would have the fade's cleanup delete the entry the restart had just written - the
        // manager would lose its handle on a track that is still audible.
        expect(manager.playSoundToken).not.toHaveBeenCalled();

        fade.finish();
        await done;

        expect(manager.order).toEqual(["stop", "play"]);
        expect(scene.state.backgroundMusic).toBe(track);
    });

    it("starts straight away when there is nothing to fade out", async () => {
        const fade = pendingFade();
        const manager = audioManager(fade);
        const scene = { state: { backgroundMusic: null } };

        await setSceneBackgroundMusic(manager.state as never, scene as never, Sound.bgm("new.mp3"), 500);

        expect(manager.stop).not.toHaveBeenCalled();
        expect(manager.order).toEqual(["play"]);
    });

    it("clears the track once the fade-out finishes when there is no incoming music", async () => {
        const outgoing = Sound.bgm("old.mp3");
        const fade = pendingFade();
        const manager = audioManager(fade);
        const scene = { state: { backgroundMusic: outgoing } };

        let settled = false;
        const done = setSceneBackgroundMusic(manager.state as never, scene as never, null, 500)
            .then(() => {
                settled = true;
            });
        await tick();

        expect(settled).toBe(false);
        fade.finish();
        await done;

        expect(manager.playSoundToken).not.toHaveBeenCalled();
        expect(scene.state.backgroundMusic).toBe(null);
    });

    it("treats a track that will not play as no music", async () => {
        const fade = pendingFade();
        const manager = audioManager(fade);
        manager.state.audioManager.playSoundToken = vi.fn(() => Promise.reject(new Error("404")));
        const scene = { state: { backgroundMusic: null } };

        await expect(
            setSceneBackgroundMusic(manager.state as never, scene as never, Sound.bgm("missing.mp3"), 0),
        ).resolves.toBeUndefined();
        expect(scene.state.backgroundMusic).toBe(null);
    });
});
