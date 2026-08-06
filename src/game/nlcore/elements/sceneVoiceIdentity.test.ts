import { describe, expect, it } from "vitest";
import { Scene } from "./scene";
import { Sound } from "./sound";

/**
 * Who owns the `Sound` a voiced line plays.
 *
 * `AudioManager` keys everything it knows about a playing clip by the `Sound` INSTANCE - `getToken`
 * is a `Map.get(sound)`. So if `getVoice` mints a new instance on every call, every caller that asks
 * "is this line's voice still playing?" gets a fresh object the manager has never seen, and the
 * honest answer "yes, it is playing" comes back as null. That is not hypothetical: auto-forward's
 * wait and `useVoiceState`'s token both go through `getVoice`.
 */
describe("Scene.getVoice identity", () => {
    it("hands out the same Sound for the same clip", () => {
        const scene = new Scene("room", { voices: { "line-1": "/voice/001.ogg" } });

        const first = scene.getVoice("line-1");
        const second = scene.getVoice("line-1");

        expect(first).toBeInstanceOf(Sound);
        expect(second).toBe(first);
    });

    it("hands out a different Sound once the clip behind the id changes", () => {
        // What a dub-language switch does: the same id, a different take.
        const voices: Record<string, string> = { "line-1": "/voice/ja/001.ogg" };
        const scene = new Scene("room", { voices });
        const japanese = scene.getVoice("line-1");

        voices["line-1"] = "/voice/en/001.ogg";
        (scene as unknown as { config: { voices: Record<string, string> } }).config.voices["line-1"] = "/voice/en/001.ogg";
        const english = scene.getVoice("line-1");

        expect(english).not.toBe(japanese);
        expect((english as Sound).getSrc()).toContain("/voice/en/001.ogg");
    });

    it("passes a pre-built Sound through untouched", () => {
        // A take on a per-character bus arrives as a Sound and must stay that exact instance.
        const built = Sound.voice({ src: "/voice/alice/001.ogg" });
        const scene = new Scene("room", { voices: { "line-1": built } });

        expect(scene.getVoice("line-1")).toBe(built);
        expect(scene.getVoice("line-1")).toBe(built);
    });

    it("keeps two ids apart", () => {
        const scene = new Scene("room", { voices: { a: "/voice/a.ogg", b: "/voice/b.ogg" } });

        expect(scene.getVoice("a")).not.toBe(scene.getVoice("b"));
    });

    it("answers null for an id the scene has no take for", () => {
        const scene = new Scene("room", { voices: { a: "/voice/a.ogg" } });

        expect(scene.getVoice("nope")).toBeNull();
        expect(scene.getVoice(null)).toBeNull();
    });
});
