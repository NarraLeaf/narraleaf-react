import { describe, expect, it, vi } from "vitest";
import { Character } from "@core/elements/character";
import { Scene } from "@core/elements/scene";
import { Story } from "@core/elements/story";

/**
 * The story hash is asked for where the player is waiting: `newGame()` stamps it into the new
 * save's metadata, and every save asks again. Computing it walks every action reachable from the
 * entry scene and concatenates what each one stringifies to, which on a full-length story is tens
 * of milliseconds - MEASURED at 113ms of the 144ms a `newGame()` cost on one. Nothing can change
 * the answer once the story has been constructed, so it is computed once and kept.
 */
describe("Story.hash", () => {
    function storyWithLines(count: number): Story {
        const scene = new Scene("scene");
        const character = new Character("Character");
        for (let i = 0; i < count; i += 1) {
            scene.action([character.say(`line ${i}`)]);
        }
        return new Story("story").entry(scene).constructStory();
    }

    it("gives the same answer every time it is asked", () => {
        const story = storyWithLines(4);

        expect(story.hash()).toBe(story.hash());
        expect(story.hash(true)).toBe(story.hash(true));
    });

    it("walks the story once, however many times it is asked", () => {
        const story = storyWithLines(4);
        const stringify = vi.spyOn(story, "stringify");

        story.hash();
        story.hash();
        story.hash();

        expect(stringify).toHaveBeenCalledTimes(1);
    });

    it("keeps the strict and lenient answers apart", () => {
        const story = storyWithLines(4);
        const stringify = vi.spyOn(story, "stringify");

        story.hash(false);
        story.hash(true);

        expect(stringify).toHaveBeenNthCalledWith(1, false);
        expect(stringify).toHaveBeenNthCalledWith(2, true);
    });

    it("goes back to the story after it has been constructed again", () => {
        const story = storyWithLines(4);
        story.hash();
        const stringify = vi.spyOn(story, "stringify");

        // A second construction can reach a different set of actions, so the kept answer is no
        // longer one about this story.
        story.constructStory();
        story.hash();

        expect(stringify).toHaveBeenCalledTimes(1);
    });
});
