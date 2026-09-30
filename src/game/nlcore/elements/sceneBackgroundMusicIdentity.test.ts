import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do — see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Game, Image, Scene, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import type { LogicAction } from "@core/action/logicAction";

/**
 * A scene's background music has to be nameable by a save.
 *
 * `AudioManager` records every clip it is playing into the save and looks each one back up by
 * element id on the way in. A scene's music is the one clip that reaches it without being any
 * action's callee — the scene is the callee, the music is state hanging off it — so the walks that
 * hand out element ids and build the load-time lookup table both used to miss it. It went into
 * saves under the empty id every unresolved element carries, came back matching nothing, and the
 * music did not resume: a loaded save played on in silence.
 */
function harness() {
    const game = new Game({ app: { debug: false } });
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });

    const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
    const swapped = Sound.bgm({ src: "/finale.mp3" });
    const image = new Image({ src: "/bg.png" });
    const scene = new Scene("s", { backgroundMusic: theme });
    scene.action([image.show(), scene.setBackgroundMusic(swapped, 100)] as never);

    const story = new Story("t").entry(scene);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    return { liveGame, theme, swapped, image };
}

describe("a scene's background music is an element a save can name", () => {
    it("gives the configured track and a swapped-in track ids of their own", () => {
        const { theme, swapped } = harness();
        expect(theme.getId()).toBeTruthy();
        expect(swapped.getId()).toBeTruthy();
        expect(theme.getId()).not.toBe(swapped.getId());
    });

    it("numbers them apart from the elements every existing save refers to", () => {
        const { theme, swapped, image } = harness();
        // Element ids are positions in a walk of the action tree. Folding these two in would move
        // every id after them, so they take a series of their own.
        expect(image.getId()).toMatch(/^e-\d+$/);
        expect(theme.getId()).toMatch(/^s-\d+$/);
        expect(swapped.getId()).toMatch(/^s-\d+$/);
    });

    it("puts them in the table a load looks elements up in", () => {
        const { liveGame, theme, swapped } = harness();
        const [, elements] = (liveGame as unknown as {
            constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
        }).constructMaps();

        expect(elements.get(theme.getId())).toBe(theme);
        expect(elements.get(swapped.getId())).toBe(swapped);
        // Nothing lands under the empty id an unresolved element carries — that was the whole bug.
        expect(elements.has("")).toBe(false);
    });

    it("keeps the id of a track that is also acted on, so its saves still resolve", () => {
        const game = new Game({ app: { debug: false } });
        const track = Sound.bgm({ src: "/theme.mp3" });
        const scene = new Scene("s", { backgroundMusic: track });
        // The same clip the scene owns, now also the callee of a sound action.
        scene.action([track.setVolume(0.5)] as never);
        const story = new Story("t").entry(scene);
        story.constructStory();
        void game;

        expect(track.getId()).toMatch(/^e-\d+$/);
    });
});
