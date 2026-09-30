import { describe, expect, it } from "vitest";
// Import through the public barrel (as consumers do) so the module graph initialises in the same
// order the library ships with (see camera.test.ts for why an isolated import trips the
// pre-existing circular static-init order between transform/gameState/scene/text).
import { Camera, DevTools, Game, Layer, Scene, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { TransformDefinitions } from "@core/elements/transform/type";

/**
 * `reset()` — the internal lifecycle hook every element inherits from `BaseElement` — returns an
 * element to the state its constructor config describes. It runs when a new game starts, before a
 * save is applied, and when a scene is left.
 *
 * Two elements used to ignore it. `Camera` shadowed it with a public chainable helper (now
 * {@link Camera.resetCamera}), so starting a new game built a transform nobody executed and the
 * stage kept the previous playthrough's framing; `Layer` never overrode it at all, so a layer slid
 * aside or faded out in one scene carried that pose into the next. The division the engine keeps is
 * that layers belong to the scene that declared them and reset with it, while the story camera
 * frames the whole stage and deliberately outlives a scene change.
 */

/**
 * A headless `Game` / `LiveGame` / `GameState`, with a real one-scene story loaded. Nothing here
 * touches the DOM: the stage handles a player would supply are no-ops, and no element is rendered.
 */
function harness(camera: Camera, layer: Layer) {
    const game = new Game({});
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });
    const scene = new Scene("s", { layers: [layer] });
    // The camera has to appear in the story's action tree for `newGame` to find it: the element map
    // it resets is built from the callees of reachable actions, not from the story's own fields.
    scene.action([camera.zoom(1, 0), "hi"] as never);
    const story = new Story("t", { camera }).entry(scene);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    return { state, scene, liveGame };
}

/**
 * Move a displayable the way a played transform leaves it — a whole new state object, which is what
 * the transform pipeline writes back. Going through `overwrite` would need the element's write key.
 */
function pose<T extends TransformDefinitions.Types>(
    element: { transformState: { get(): T; forceOverwrite(state: Partial<T>): unknown } },
    props: Partial<T>
): void {
    element.transformState.forceOverwrite({ ...element.transformState.get(), ...props });
}

describe("newGame() returns the story camera to its initial pose", () => {
    it("undoes a camera move left over from the previous playthrough", () => {
        const camera = new Camera();
        const { liveGame } = harness(camera, new Layer("l"));

        pose(camera, { zoom: 3, filter: "brightness(0.2)" });
        liveGame.newGame();

        expect(camera.transformState.get().zoom).toBe(1);
        expect(camera.transformState.get().filter).toBeUndefined();
    });

    it("restores the pose the camera was configured with, not a hardcoded neutral one", () => {
        const camera = new Camera({ zoom: 1.5 });
        const { liveGame } = harness(camera, new Layer("l"));

        pose(camera, { zoom: 3 });
        liveGame.newGame();

        expect(camera.transformState.get().zoom).toBe(1.5);
    });
});

describe("leaving a scene", () => {
    it("resets the layers the scene declared", () => {
        const layer = new Layer("l", { zIndex: 3 });
        const { state, scene } = harness(new Camera(), layer);
        state.addScene(scene);

        pose(layer, { opacity: 0, zoom: 2 });
        layer.state.zIndex = 9;
        state.removeScene(scene);

        expect(layer.transformState.get().opacity).toBe(1);
        expect(layer.transformState.get().zoom).toBe(1);
        expect(layer.state.zIndex).toBe(3);
    });

    it("leaves the story camera's pose untouched", () => {
        const camera = new Camera();
        const { state, scene } = harness(camera, new Layer("l"));
        state.addScene(scene);

        // Only images, texts and puppets emit `displayable:init`, which is what registers an element
        // into the layer map a scene exit walks — so this hand registration is the one route by which
        // the camera can reach it, and the route the exclusion in `resetLayers` exists for.
        DevTools.registerDisplayable(state, camera, scene, scene.config.defaultDisplayableLayer);

        pose(camera, { zoom: 2 });
        state.removeScene(scene);

        expect(camera.transformState.get().zoom).toBe(2);
    });
});
