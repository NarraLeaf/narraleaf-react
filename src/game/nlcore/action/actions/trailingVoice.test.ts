import { describe, expect, it } from "vitest";
import { CharacterAction } from "./characterAction";
import { Sound } from "@core/elements/sound";
import type { GameState } from "@player/gameState";

/**
 * "Let it play on" against the next voiced line.
 *
 * The mode means a clip outlives its own sentence; it does not mean two actors talk at once. Before
 * this, advancing under that mode layered each clip over the last, and a player clicking quickly
 * stacked three or four. The seam is `cutTrailingVoice`, so the test drives it with a duck-typed
 * game state and watches which clips get stopped - the repo's usual idiom.
 */

function makeState(playing: Set<Sound>) {
    const stopped: Sound[] = [];
    const state = {
        audioManager: {
            isPlaying: (sound: Sound) => playing.has(sound),
            stop: (sound: Sound) => { stopped.push(sound); playing.delete(sound); return { then: () => undefined }; },
        },
        timelines: { attachTimeline: () => undefined },
    } as unknown as GameState;
    return { state, stopped };
}

describe("cutTrailingVoice", () => {
    it("stops the clip an earlier line left running when the next voice starts", () => {
        const first = Sound.voice("a.ogg");
        const second = Sound.voice("b.ogg");
        const playing = new Set([first]);
        const { state, stopped } = makeState(playing);

        CharacterAction.cutTrailingVoice(state, first);
        CharacterAction.cutTrailingVoice(state, second);

        expect(stopped).toEqual([first]);
    });

    it("leaves the trailing clip alone across an unvoiced line", () => {
        // The point of the mode: narration passes over a clip that is still finishing.
        const first = Sound.voice("a.ogg");
        const playing = new Set([first]);
        const { state, stopped } = makeState(playing);

        CharacterAction.cutTrailingVoice(state, first);
        // An unvoiced line never calls this at all; assert the "no next voice" call is harmless too.
        expect(stopped).toEqual([]);
        expect(playing.has(first)).toBe(true);
    });

    it("does not stop a clip that has already finished on its own", () => {
        const first = Sound.voice("a.ogg");
        const second = Sound.voice("b.ogg");
        const { state, stopped } = makeState(new Set());

        CharacterAction.cutTrailingVoice(state, first);
        CharacterAction.cutTrailingVoice(state, second);

        expect(stopped).toEqual([]);
    });

    it("does not stop the very clip that is about to play again", () => {
        // Replaying one line: `AudioManager.play` restarts the same instance itself.
        const only = Sound.voice("a.ogg");
        const playing = new Set([only]);
        const { state, stopped } = makeState(playing);

        CharacterAction.cutTrailingVoice(state, only);
        CharacterAction.cutTrailingVoice(state, only);

        expect(stopped).toEqual([]);
    });

    it("keeps two games apart", () => {
        const a = Sound.voice("a.ogg");
        const b = Sound.voice("b.ogg");
        const first = makeState(new Set([a]));
        const second = makeState(new Set([b]));

        CharacterAction.cutTrailingVoice(first.state, a);
        CharacterAction.cutTrailingVoice(second.state, b);
        // A new voice in the second game must not reach into the first game's trailing clip.
        CharacterAction.cutTrailingVoice(second.state, Sound.voice("c.ogg"));

        expect(first.stopped).toEqual([]);
        expect(second.stopped).toEqual([b]);
    });
});
