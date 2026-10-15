import { describe, expect, it } from "vitest";
// Imported through the entry, as avatar.test.ts does, for the module initialisation order.
import { Character, Image, Sentence } from "narraleaf-react";
import { CharacterAction } from "@core/action/actions/characterAction";
import { avatarSourceToUrl, resolveSentenceAvatar } from "@core/elements/character/sentenceAvatar";
import type { GameState } from "@player/gameState";

/**
 * The avatar a line is shown with, which is also what its backlog entry records.
 *
 * A backlog is opened long after its lines were said, and the face a character had at a line is not
 * the face she has now. The dialog resolves the avatar from the portrait she wears while the line is
 * on screen, so the entry has to record that answer when the line is reached rather than ask again
 * later.
 */

/** A game state whose stage has `alice` wearing `portrait`, or nothing when it is null. */
function stage(alice: Character, portrait: Image | null, avatar?: string): GameState {
    return {
        findCurrentPortraitForCharacter: (character: Character) =>
            character === alice && portrait ? { image: portrait, avatar } : null,
        logger: { warn: () => undefined },
    } as unknown as GameState;
}

const lineAvatar = (gameState: GameState, sentence: Sentence): string | null =>
    (CharacterAction as unknown as { lineAvatar(g: GameState, s: Sentence): string | null }).lineAvatar(gameState, sentence);

describe("the avatar a line is shown with", () => {
    it("is the avatar of the portrait the speaker wears on stage", () => {
        const smiling = new Image({ src: "/sprites/smile.png" });
        const alice = new Character("Alice").setAvatar("/avatars/default.png");
        const sentence = new Sentence("Morning.", { character: alice });

        expect(avatarSourceToUrl(resolveSentenceAvatar(stage(alice, smiling, "/avatars/smile.png"), alice, sentence).source))
            .toBe("/avatars/smile.png");
        expect(lineAvatar(stage(alice, smiling, "/avatars/smile.png"), sentence)).toBe("/avatars/smile.png");
    });

    it("falls back to the character's avatar off stage, and is nothing for narration", () => {
        const alice = new Character("Alice").setAvatar("/avatars/default.png");
        expect(lineAvatar(stage(alice, null), new Sentence("Morning.", { character: alice }))).toBe("/avatars/default.png");
        expect(lineAvatar(stage(alice, null), new Sentence("The corridor was empty."))).toBeNull();
    });

    it("costs the entry its picture, not the line, when a resolver throws", () => {
        const alice = new Character("Alice").setAvatar(() => {
            throw new Error("broken resolver");
        });
        expect(lineAvatar(stage(alice, null), new Sentence("Morning.", { character: alice }))).toBeNull();
    });
});
