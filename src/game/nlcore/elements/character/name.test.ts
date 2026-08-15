import { describe, expect, it } from "vitest";
// Through the library entry: reaching into the element modules directly pulls scene -> layer in an
// order that leaves `TransformState` uninitialized (see avatarPreload.test.ts).
import { Character, Scene, Story } from "narraleaf-react";
import type { LogicAction } from "@core/action/logicAction";
import type { ActionExecutionInjection } from "@core/action/action";
import type { GameState } from "@player/gameState";

/**
 * A character's display name is runtime state, and a save has to carry it.
 *
 * `Character.setName` is what a story uses to hold a speaker back as "???" and reveal who she is
 * later. It writes straight into `state.name`, so from the moment that line runs the element no
 * longer holds what the author wrote — and until `Character` gained a `toData`,
 * `Story.getAllElementStates` dropped every character from the save (it discards elements whose
 * `toData` returns nothing). Saving after the reveal and loading put "???" back on the screen with
 * nothing reporting it.
 *
 * The save path is exercised the way `LiveGame.deserialize` walks it — `getAllElementStates` out,
 * `reset()` + `fromData` back in, resolved through the same element map — rather than against a
 * live game, which would need a React stage.
 */

type BuiltStory = {
    story: Story;
    scene: Scene;
    alice: Character;
};

/** One scene in which "???" speaks, reveals herself as Alice, and speaks again. */
function buildStory(): BuiltStory {
    const alice = new Character("???");
    const scene = new Scene("s1");
    scene.action([
        alice.say("..."),
        alice.setName("Alice"),
        alice.say("My name is Alice."),
    ]);
    const story = new Story("test").entry(scene).constructStory();

    return { story, scene, alice };
}

/**
 * Run the real `character:setName` handler.
 *
 * That branch reaches back into the game state only to register an undo entry, so a stub carrying
 * an `actionHistory` drives the true mutation path (the same duck-typing controlJump.test.ts uses)
 * instead of the test assigning `state.name` itself and proving nothing.
 */
function reveal({ story, scene }: BuiltStory): void {
    const action = story
        .getAllChildren(story, scene.getSceneRoot())
        .find(a => a.type === "character:setName");
    if (!action) {
        throw new Error("No character:setName action in the constructed story");
    }

    const gameState = {
        actionHistory: { push: () => ({ id: "undo-0" }) },
    } as unknown as GameState;
    action.executeAction(gameState, { stackModel: null } as unknown as ActionExecutionInjection);
}

/**
 * The element half of `LiveGame.deserialize`: every id the save names is reset to its authored
 * state and then given what the save carries. An id the save does not name is not visited at all,
 * which is exactly how an older save gets to keep the authored name.
 */
function restore(story: Story, elementStates: { id: string; data: unknown }[]): void {
    const elements = new Map<string, LogicAction.GameElement>();
    story.forEachChild(story, story.entryScene?.getSceneRoot() || [], action => {
        elements.set(action.callee.getId(), action.callee);
    }, { allowFutureScene: true });

    elementStates.forEach(({ id, data }) => {
        const element = elements.get(id);
        if (!element) {
            throw new Error("Element not found, id: " + id);
        }
        element.reset();
        element.fromData(data as never);
    });
}

describe("Character name — save and load", () => {
    it("is in the save at all", () => {
        const built = buildStory();

        // The filter in `getAllElementStates` drops anything whose `toData` returns nothing, so a
        // character used to be absent here no matter what its name had become.
        expect(built.story.getAllElementStates().map(e => e.id)).toContain(built.alice.getId());
    });

    it("a mid-scene rename survives a save/load round trip", () => {
        const saved = (() => {
            const built = buildStory();
            reveal(built);
            expect(built.alice.state.name).toBe("Alice");
            return built.story.getAllElementStates();
        })();

        // A fresh construction is what a reload gets: the authored name, before the save applies.
        const loaded = buildStory();
        expect(loaded.alice.state.name).toBe("???");

        restore(loaded.story, saved);
        expect(loaded.alice.state.name).toBe("Alice");
    });

    it("reset() hands back the authored name, not the one the last playthrough left", () => {
        const built = buildStory();
        reveal(built);
        expect(built.alice.state.name).toBe("Alice");

        // `LiveGame.newGame()` runs this over every element, and a new game must open on "???".
        built.alice.reset();
        expect(built.alice.state.name).toBe("???");
    });

    it("a save written before characters were serialized still loads", () => {
        const built = buildStory();
        // What such a save looks like: the character simply has no entry in `elementStates`.
        const legacy = built.story
            .getAllElementStates()
            .filter(e => e.id !== built.alice.getId());

        expect(() => restore(built.story, legacy)).not.toThrow();
        // No entry means the element is never visited, so it keeps the name construction gave it.
        expect(built.alice.state.name).toBe("???");
    });
});
