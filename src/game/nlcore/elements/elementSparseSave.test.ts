import { describe, expect, it } from "vitest";
// Import through the public barrel (as consumers do) so the module graph initialises in the same
// order the library ships with (see camera.test.ts for why an isolated import trips the
// pre-existing circular static-init order between transform/gameState/scene/text).
import { Camera, Character, Game, Image, Layer, Scene, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { LiveGame } from "@core/game/liveGame";
import type { ActionExecutionInjection } from "@core/action/action";
import type { LogicAction } from "@core/action/logicAction";

/**
 * A save carries the elements whose state no longer matches what the script wrote — not the whole
 * cast.
 *
 * A story reaches every element of every scene it can jump to, so serialising all of them wrote the
 * entire project into every save, and into every per-line history snapshot besides. What actually
 * differs at any moment is small: leaving a scene returns everything that scene put on stage to its
 * authored state, so the elements that have drifted are the ones the current scene is using plus the
 * few that outlive a scene by design.
 *
 * Two things make leaving an element out safe rather than lossy. `LiveGame.deserialize` resets every
 * element before applying a save, so "absent" restores as "as authored". And what decides inclusion
 * is the comparison against the authored state, never the dirty flag — the flag only narrows which
 * elements are worth serialising, so a flag left standing costs a comparison rather than a wrong
 * save. The flag failing the other way — state written with nothing marking it — is the one real
 * risk, and `Story.findUnmarkedElements` plus the audit in debug builds exist to catch it.
 *
 * The element played here is a `Character`: `setName` is state a save has to carry and needs no
 * renderer, whereas showing an image reaches for an exposed state only a mounted stage provides.
 * The image in the story is the untouched-element half of the story, and never played.
 */

function harness(options: { debug?: boolean } = {}) {
    const game = new Game({ app: { debug: options.debug ?? false } });
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });

    const camera = new Camera();
    const layer = new Layer("l");
    const image = new Image({ src: "/bg.png" });
    const alice = new Character("???");
    const scene = new Scene("s", { layers: [layer] });
    scene.action([image.show(), alice.setName("Alice")] as never);
    const story = new Story("t", { camera }).entry(scene);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    return { game, state, story, scene, image, alice, camera, layer, liveGame };
}

/**
 * Play every action the story holds for one element, through the same dispatch the engine uses —
 * `LiveGame.executeAction`, which is where an element is marked as worth serialising.
 */
function play(
    liveGame: LiveGame,
    state: GameState,
    story: Story,
    scene: Scene,
    element: LogicAction.GameElement
): void {
    story.getAllChildren(story, scene.getSceneRoot())
        .filter(action => action.callee === element)
        .forEach(action => liveGame.executeAction(
            state, action, { stackModel: null } as unknown as ActionExecutionInjection
        ));
}

const idsIn = (story: Story) => story.getAllElementStates().map(entry => entry.id);

/** Enough of a save header to load one: `deserialize` reads the game body, not this. */
const meta = () => ({
    created: 0, updated: 0, id: "save-0", lastSentence: null, lastSpeaker: null, storyHash: "", version: 3,
});

describe("a save carries only what differs from the authored state", () => {
    it("writes nothing for a story nobody has played yet", () => {
        const { story } = harness();

        expect(idsIn(story)).toEqual([]);
    });

    it("carries an element once an action has run against it", () => {
        const { story, scene, alice, liveGame, state } = harness();

        play(liveGame, state, story, scene, alice);

        expect(alice.state.name).toBe("Alice");
        expect(idsIn(story)).toEqual([alice.getId()]);
    });

    it("drops an element again once it is back at its authored state", () => {
        const { story, scene, alice, liveGame, state } = harness();
        play(liveGame, state, story, scene, alice);
        expect(idsIn(story)).toContain(alice.getId());

        // What leaving a scene does to everything it put on stage. The element is still marked from
        // the action that ran; the comparison, not the mark, is what keeps it out of the save.
        alice.reset();

        expect(idsIn(story)).not.toContain(alice.getId());
    });

    it("skips an element whose state was written without the dispatch marking it", () => {
        const { story, image } = harness();

        // A write that never passed through `LiveGame.executeAction`: unmarked, so the save path
        // does not even serialise it — this is the failure the audit below exists for.
        image.state.currentSrc = "/other.png";
        expect(idsIn(story)).not.toContain(image.getId());

        image.markDirty();
        expect(idsIn(story)).toContain(image.getId());
    });
});

describe("loading resets what the save does not name", () => {
    it("returns an element the save is silent about to its authored state", () => {
        const { story, scene, alice, liveGame, state } = harness();
        play(liveGame, state, story, scene, alice);

        const saved = liveGame.serializeGameState();
        expect(saved.elementStates.map(entry => entry.id)).toContain(alice.getId());

        // A save that names nobody — which is what an untouched story now writes, and what an older
        // save looks like for an element it predates.
        liveGame.deserialize({
            name: "s",
            meta: meta(),
            game: { ...saved, elementStates: [] },
        });

        // Restored by being reset. Walking only the entries a save carries, as the old path did,
        // would have left the rename standing.
        expect(alice.state.name).toBe("???");
    });

    it("applies the entries a save does name", () => {
        const { story, scene, alice, liveGame, state } = harness();
        play(liveGame, state, story, scene, alice);
        const saved = liveGame.serializeGameState();

        alice.reset();
        expect(alice.state.name).toBe("???");

        liveGame.deserialize({ name: "s", meta: meta(), game: saved });

        expect(alice.state.name).toBe("Alice");
        // Restored state is not authored state, so the next save has to carry it even if no action
        // touches this element again.
        expect(alice.isDirty()).toBe(true);
    });
});

describe("the debug audit finds state written without a mark", () => {
    it("reports nothing while every change goes through the dispatch", () => {
        const { story, scene, alice, liveGame, state } = harness();

        play(liveGame, state, story, scene, alice);

        expect(story.findUnmarkedElements()).toEqual([]);
    });

    it("names the element whose state drifted with nothing marking it", () => {
        const { story, image } = harness();

        image.state.currentSrc = "/other.png";

        expect(story.findUnmarkedElements()).toEqual([image]);
    });

    it("warns and marks the element, so the next save carries it", () => {
        const { image, liveGame, state } = harness({ debug: true });
        const warnings: string[] = [];
        state.logger.warn = ((...args: unknown[]) => {
            warnings.push(args.join(" "));
            return state.logger;
        }) as typeof state.logger.warn;

        const interval = LiveGame.ElementAuditInterval;
        LiveGame.ElementAuditInterval = 0;
        try {
            image.state.currentSrc = "/other.png";

            // The save written right now is the one that loses the change...
            expect(liveGame.serializeGameState().elementStates.map(e => e.id)).not.toContain(image.getId());
            // ...and the audit that ran alongside it says so, and marks the element.
            expect(warnings.join("\n")).toContain(image.getId());
            expect(image.isDirty()).toBe(true);
            // ...so the next save carries it, rather than the mistake costing the whole playthrough.
            expect(liveGame.serializeGameState().elementStates.map(e => e.id)).toContain(image.getId());
        } finally {
            LiveGame.ElementAuditInterval = interval;
        }
    });

    it("stays off when the app is not in debug", () => {
        const { story, image, liveGame, state } = harness({ debug: false });
        const warnings: string[] = [];
        state.logger.warn = ((...args: unknown[]) => {
            warnings.push(args.join(" "));
            return state.logger;
        }) as typeof state.logger.warn;

        const interval = LiveGame.ElementAuditInterval;
        LiveGame.ElementAuditInterval = 0;
        try {
            image.state.currentSrc = "/other.png";
            liveGame.serializeGameState();

            expect(warnings).toEqual([]);
            expect(image.isDirty()).toBe(false);
            // The drift is real either way; a release build simply does not go looking for it.
            expect(story.findUnmarkedElements()).toEqual([image]);
        } finally {
            LiveGame.ElementAuditInterval = interval;
        }
    });
});
