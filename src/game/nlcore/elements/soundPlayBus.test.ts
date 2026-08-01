import { afterEach, describe, expect, it, vi } from "vitest";
import { Sound, SoundType } from "@core/elements/sound";
import { Chained } from "@core/action/chain";

afterEach(() => {
    vi.restoreAllMocks();
});

function actionTypesOf(chained: unknown): string[] {
    return Chained.toActions([chained as never]).map(action => action.type);
}

/**
 * `type` picks which volume slider governs a clip. It is a routing choice, not an identity, so it
 * cannot decide which chainable methods an author is allowed to call.
 */
describe("Sound.play across buses", () => {
    it("plays a bgm-typed clip instead of failing the story", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => void 0);
        const ambience = Sound.bgm({ src: "ambience.mp3", loop: true });

        // This used to throw `StaticScriptWarning` at chain-build time, which took down the entire
        // story compile - not one row - over an author putting an ambience track on the music bus so
        // the player's music slider would govern it.
        expect(actionTypesOf(ambience.play())).toEqual(["sound:play"]);
        expect(ambience.config.type).toBe(SoundType.Bgm);
        expect(warn).toHaveBeenCalledOnce();
    });

    it("still tells the author when they may have meant the scene's slot", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => void 0);

        Sound.bgm("theme.mp3").play();

        // The one real difference is worth naming: a clip played this way is not in the scene's
        // background-music slot, so scene teardown will not stop it and nothing cross-fades it.
        expect(String(warn.mock.calls[0]?.[0])).toContain("setBackgroundMusic");
    });

    it("says nothing about a clip on the sound or voice bus", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => void 0);

        Sound.sound("hit.wav").play();
        Sound.voice("line.mp3").play();

        expect(warn).not.toHaveBeenCalled();
    });
});
