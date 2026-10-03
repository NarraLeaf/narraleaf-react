import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Character, Game, Image, Scene, Story, Video } from "@core/common/core";
import { GameState, PlayerStateData } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import { Timeline } from "@player/Tasks";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * A clip belongs to the scene that showed it, and crossing a scene boundary does to it exactly what
 * it does to everything else that scene put on the stage.
 *
 * The clip is drawn above the scenes rather than on one of their layers, and nothing used to take it
 * down when its scene went: a clip that stopped on its last frame covered the whole of the next scene,
 * where nothing could even name it to hide it. The rule pinned here is the stage's own - a plain jump
 * unloads the scene it leaves, a returnable jump parks it, a return unloads the scene that was
 * called, and every one of those is undone by stepping back - with the clip following its scene
 * through each of them.
 *
 * Driven through the API a player's UI calls (`next`, `undo`, `redo`, `serialize` / `deserialize`,
 * `newGame`), with the React tree replaced by an exposed state mounted by hand for every element.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(entry: Scene): Harness {
    const game = new Game({ app: { debug: false } });
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });
    const story = new Story("t").entry(entry);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    const [, elements] = (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
    elements.forEach(element => {
        if (state.isStateMounted(element as never)) {
            return;
        }
        // One stub answers for a scene, a displayable and a clip: each action only calls its own part.
        state.mountState(element as never, {
            initDisplayable: (onMounted: VoidFunction) => onMounted(),
            setBackgroundMusic: async () => void 0,
            // A sprite's show runs a transform; it lands at once here, as a skipped one would.
            applyTransform: (_transform: unknown, done: VoidFunction) => {
                const awaitable = new Awaitable<void>();
                setTimeout(() => {
                    done();
                    awaitable.resolve();
                }, 0);
                return new Timeline(awaitable);
            },
            updateStyleSync: () => void 0,
            show: async () => void 0,
            hide: async () => void 0,
            cancelFade: () => void 0,
            play: async () => void 0,
            pause: () => void 0,
            resume: async () => void 0,
            stop: () => void 0,
            seek: () => void 0,
        } as never);
    });
    return { game, state, liveGame };
}

/** Deliver the click that settles the line on screen. */
function clickDialog(h: Harness): boolean {
    for (const element of h.state.getSceneElements()) {
        if (element.texts.length) {
            (element.texts[0] as unknown as { onClick: () => void }).onClick();
            return true;
        }
    }
    return false;
}

function pendingLine(h: Harness): string | null {
    const history = h.liveGame.getHistory();
    const last = history[history.length - 1];
    return last && last.isPending ? (last.element as { text: string }).text : null;
}

/** The line the backlog ends on - the one a step back or forward lands on. */
function lastLine(h: Harness): string | null {
    const history = h.liveGame.getHistory();
    const last = history[history.length - 1];
    return last ? (last.element as { text: string }).text : null;
}

/** Roll until `text` is the line on screen, leaving it unclicked. */
async function driveToLine(h: Harness, text: string, steps: number = 400): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (pendingLine(h) === text) {
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveToLine: story ended before "${text}"`);
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
            if (!result.isSettled()) {
                if (pendingLine(h) === text) {
                    return;
                }
                if (!clickDialog(h)) {
                    throw new Error("driveToLine: parked on an awaitable that never settled");
                }
            }
        }
        await tick();
    }
    throw new Error(`driveToLine: "${text}" never appeared`);
}

/** Roll to the end of the story, clicking each line. */
async function driveToEnd(h: Harness, steps: number = 400): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
            if (!result.isSettled() && !clickDialog(h)) {
                throw new Error("driveToEnd: parked on an awaitable that never settled");
            }
        }
        await tick();
    }
    throw new Error("driveToEnd: ran out of steps");
}

/** Let a restore that went through the load path land. */
async function settle(h: Harness): Promise<void> {
    h.state.events.emit(GameState.EventTypes["event:state.onRender"]);
    await tick();
    await tick();
}

/** Load a save into the running game the way every host does: a new game, then the save. */
async function load(h: Harness, saved: SavedGame): Promise<void> {
    h.liveGame.newGame();
    h.liveGame.deserialize(JSON.parse(JSON.stringify(saved)) as SavedGame);
    await settle(h);
}

/** The clips the story has on the stage, each with the scene it belongs to. */
function clips(h: Harness): [src: string, owner: string | null, display: boolean][] {
    return h.state.getVideos()
        .filter(video => h.state.isVideoAdded(video))
        .map(video => [video.config.src, h.state.getVideoOwner(video)?.config.name ?? null, video.state.display]);
}

/** `cutscene` shows and plays a clip that stops on its last frame, then a plain jump to `next`. */
function plainJumpStory() {
    const narrator = new Character("N");
    const clip = new Video({ src: "cutscene.mp4" });
    const next = new Scene("next");
    const cutscene = new Scene("cutscene");
    next.action([narrator.say("B1"), narrator.say("B2")] as never);
    cutscene.action([
        clip.show(),
        clip.play(),
        narrator.say("A1"),
        cutscene.jumpTo(next),
    ] as never);
    return { clip, cutscene, next };
}

/** `caller` shows a clip, calls `called`, and carries on after the call returns. */
function callStory() {
    const narrator = new Character("N");
    const clip = new Video({ src: "cutscene.mp4" });
    const called = new Scene("called");
    const caller = new Scene("caller");
    called.action([narrator.say("C1"), narrator.say("C2")] as never);
    caller.action([
        clip.show(),
        clip.play(),
        narrator.say("A1"),
        caller.jumpTo(called, { returnable: true }),
        narrator.say("A2"),
    ] as never);
    return { clip, caller, called };
}

describe("a plain jump", () => {
    it("takes the clip off the stage with the scene that showed it", async () => {
        const { clip, cutscene } = plainJumpStory();
        const h = harness(cutscene);
        h.liveGame.newGame();

        await driveToLine(h, "A1");
        expect(clips(h)).toEqual([["cutscene.mp4", "cutscene", true]]);

        await driveToLine(h, "B1");
        // The scene the clip belonged to is gone, and the clip with it - not left behind on its
        // last frame over the scene the story jumped to.
        expect(h.state.getSceneElements().map(element => element.scene.config.name)).toEqual(["next"]);
        expect(clips(h)).toEqual([]);
        expect(h.state.getVideos()).not.toContain(clip);
        // Back to its authored state, as the sprites a leaving scene takes with it are.
        expect(clip.state.display).toBe(false);
    });

    it("leaves nothing of the clip in a save taken after it, and a load brings nothing back", async () => {
        const { cutscene } = plainJumpStory();
        const h = harness(cutscene);
        h.liveGame.newGame();
        await driveToLine(h, "B1");

        const saved = h.liveGame.serialize();
        expect(saved.game.stage.videos).toEqual([]);

        await load(h, saved);
        expect(lastLine(h)).toBe("B1");
        expect(clips(h)).toEqual([]);
        await driveToLine(h, "B2");
        expect(clips(h)).toEqual([]);
    });

    it("is undone by stepping back across it: the clip comes back with its scene", async () => {
        const { cutscene } = plainJumpStory();
        const h = harness(cutscene);
        h.liveGame.newGame();
        await driveToLine(h, "B1");

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(lastLine(h)).toBe("A1");
        expect(h.state.getSceneElements().map(element => element.scene.config.name)).toEqual(["cutscene"]);
        expect(clips(h)).toEqual([["cutscene.mp4", "cutscene", true]]);

        // And forward again across the jump: gone again, the same way.
        expect(h.liveGame.redo()).toBe(true);
        await settle(h);
        expect(lastLine(h)).toBe("B1");
        expect(clips(h)).toEqual([]);
    });

    it("is undone the same way from a loaded save, through the line's own snapshot", async () => {
        const { cutscene } = plainJumpStory();
        const h = harness(cutscene);
        h.liveGame.newGame();
        await driveToLine(h, "B1");
        await load(h, h.liveGame.serialize());
        // A load leaves no live undo stack: this step back can only go through the snapshot.
        expect(h.state.actionHistory.getHistory()).toHaveLength(0);

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(lastLine(h)).toBe("A1");
        expect(clips(h)).toEqual([["cutscene.mp4", "cutscene", true]]);
    });
});

describe("the rule the clip follows is the stage's own", () => {
    it("goes and comes back exactly when a sprite the same scene showed does", async () => {
        const narrator = new Character("N");
        const clip = new Video({ src: "cutscene.mp4" });
        const sprite = new Image({ src: "sprite.png" });
        const next = new Scene("next");
        const cutscene = new Scene("cutscene");
        next.action([narrator.say("B1")] as never);
        cutscene.action([
            sprite.show(),
            clip.show(),
            narrator.say("A1"),
            cutscene.jumpTo(next),
        ] as never);
        const h = harness(cutscene);
        h.liveGame.newGame();
        const onStage = () => ({
            sprite: h.state.findElementByDisplayable(sprite) !== null,
            clip: h.state.isVideoAdded(clip),
        });

        await driveToLine(h, "A1");
        expect(onStage()).toEqual({ sprite: true, clip: true });

        await driveToLine(h, "B1");
        expect(onStage()).toEqual({ sprite: false, clip: false });

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(onStage()).toEqual({ sprite: true, clip: true });
    });
});

describe("a returnable jump", () => {
    it("parks the caller's clip with the caller, and the clip is there again when the call returns", async () => {
        const { clip, caller } = callStory();
        const h = harness(caller);
        h.liveGame.newGame();

        await driveToLine(h, "C1");
        // Parked, not unloaded: the caller keeps everything it has, the clip included. What stops it
        // painting over the called scene is the pose it shares with the parked scene.
        expect(h.state.isSceneSuspended(caller)).toBe(true);
        expect(clips(h)).toEqual([["cutscene.mp4", "caller", true]]);

        await driveToLine(h, "A2");
        expect(h.state.isSceneSuspended(caller)).toBe(false);
        expect(clips(h)).toEqual([["cutscene.mp4", "caller", true]]);
        expect(clip.state.display).toBe(true);
    });

    it("unloads a clip the called scene showed when the call returns", async () => {
        const narrator = new Character("N");
        const clip = new Video({ src: "insert.mp4" });
        const called = new Scene("called");
        const caller = new Scene("caller");
        called.action([clip.show(), narrator.say("C1")] as never);
        caller.action([
            narrator.say("A1"),
            caller.jumpTo(called, { returnable: true }),
            narrator.say("A2"),
        ] as never);
        const h = harness(caller);
        h.liveGame.newGame();

        await driveToLine(h, "C1");
        expect(clips(h)).toEqual([["insert.mp4", "called", true]]);

        await driveToLine(h, "A2");
        expect(clips(h)).toEqual([]);

        // Stepping back over the return puts the called scene back, and its clip with it.
        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(lastLine(h)).toBe("C1");
        expect(clips(h)).toEqual([["insert.mp4", "called", true]]);
    });

    it("moves a caller's clip shown again from the called scene to the called scene", async () => {
        const narrator = new Character("N");
        const clip = new Video({ src: "shared.mp4" });
        const called = new Scene("called");
        const caller = new Scene("caller");
        called.action([clip.show(), narrator.say("C1")] as never);
        caller.action([
            clip.show(),
            narrator.say("A1"),
            caller.jumpTo(called, { returnable: true }),
            narrator.say("A2"),
        ] as never);
        const h = harness(caller);
        h.liveGame.newGame();

        await driveToLine(h, "A1");
        expect(clips(h)).toEqual([["shared.mp4", "caller", true]]);

        // Left with the caller it would be parked with the caller, and the show would show nothing.
        await driveToLine(h, "C1");
        expect(clips(h)).toEqual([["shared.mp4", "called", true]]);

        // The called scene took it, so the called scene takes it away - as it would a sprite it moved.
        await driveToLine(h, "A2");
        expect(clips(h)).toEqual([]);
    });

    it("carries the clip's scene through a save taken inside the call", async () => {
        const { caller } = callStory();
        const h = harness(caller);
        h.liveGame.newGame();
        await driveToLine(h, "C1");

        const saved = h.liveGame.serialize();
        const callerRecord = saved.game.stage.scenes.find(scene => scene.sceneId === caller.getId());
        expect(callerRecord?.elements.videos).toHaveLength(1);

        await load(h, saved);
        expect(h.state.isSceneSuspended(caller)).toBe(true);
        expect(clips(h)).toEqual([["cutscene.mp4", "caller", true]]);

        await driveToLine(h, "A2");
        expect(clips(h)).toEqual([["cutscene.mp4", "caller", true]]);
    });

    it("gives the parked caller's clip up when a plain jump gives the caller up", async () => {
        const narrator = new Character("N");
        const clip = new Video({ src: "cutscene.mp4" });
        const elsewhere = new Scene("elsewhere");
        const called = new Scene("called");
        const caller = new Scene("caller");
        elsewhere.action([narrator.say("E1")] as never);
        called.action([narrator.say("C1"), called.jumpTo(elsewhere)] as never);
        caller.action([
            clip.show(),
            narrator.say("A1"),
            caller.jumpTo(called, { returnable: true }),
            narrator.say("A2"),
        ] as never);
        const h = harness(caller);
        h.liveGame.newGame();

        await driveToLine(h, "C1");
        expect(clips(h)).toEqual([["cutscene.mp4", "caller", true]]);

        // The jump clears the call stack, so nothing can return to the caller: it is unloaded, and
        // its clip goes with it.
        await driveToLine(h, "E1");
        expect(h.state.getSceneElements().map(element => element.scene.config.name)).toEqual(["elsewhere"]);
        expect(clips(h)).toEqual([]);

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(lastLine(h)).toBe("C1");
        expect(clips(h)).toEqual([["cutscene.mp4", "caller", true]]);
    });
});

describe("the other boundaries", () => {
    it("leaves the clip where it is when the story runs out, as it leaves the sprites", async () => {
        const narrator = new Character("N");
        const clip = new Video({ src: "ending.mp4" });
        const last = new Scene("last");
        last.action([clip.show(), clip.play(), narrator.say("The end.")] as never);
        const h = harness(last);
        h.liveGame.newGame();

        await driveToEnd(h);
        expect(clips(h)).toEqual([["ending.mp4", "last", true]]);
    });

    it("clears the clip with everything else on a new game", async () => {
        const { clip, caller } = callStory();
        const h = harness(caller);
        h.liveGame.newGame();
        await driveToLine(h, "C1");

        h.liveGame.newGame();
        expect(h.state.getVideos()).not.toContain(clip);
        expect(h.state.getVideoOwner(clip)).toBe(null);
    });

    it("gives a clip from a save that names no scene for it to the scene the story is in", async () => {
        const { clip, cutscene } = plainJumpStory();
        const h = harness(cutscene);
        h.liveGame.newGame();
        await driveToLine(h, "A1");

        // A save written before clips belonged to scenes: the clip is on the stage, and no scene
        // record says whose it is.
        const saved = h.liveGame.serialize();
        const stage = saved.game.stage as PlayerStateData;
        stage.scenes.forEach(scene => delete scene.elements.videos);
        await load(h, saved);
        expect(clips(h)).toEqual([["cutscene.mp4", "cutscene", true]]);

        // So it still leaves with that scene.
        await driveToLine(h, "B1");
        expect(h.state.getVideos()).not.toContain(clip);
    });
});
