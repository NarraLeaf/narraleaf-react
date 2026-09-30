import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do, so the module graph initialises in the order the
// library ships with (see camera.test.ts for the static-init order this avoids tripping).
import { Character, Game, Scene, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import type { LiveGame } from "@core/game/liveGame";
import type { LogicAction } from "@core/action/logicAction";
import type { GameHistory } from "./gameHistory";

/**
 * The history stack, end to end: the timeline and the play head, what a save carries of it, and what
 * moving the game along it does.
 *
 * The model is one timeline with a play head. Everything up to the head is the backlog; everything
 * past it is a future the player has already read and can step forward into again. `undo`, `redo`
 * and `restoreToHistory` all move that head, and there are two ways of carrying a move out:
 *
 *   - in place, by unwinding the undo each action registered as it ran — cheap, and it disturbs
 *     nothing the stage is doing, which is why the music does not restart;
 *   - by restoring the line's snapshot, which works for any line a save carries but goes through the
 *     whole load path.
 *
 * Both have to land in the same state, or the same call would mean different things depending on how
 * far back the player went. That equivalence, the boundaries of each direction, and the rule that a
 * save written in the past carries no future are what these tests are about.
 */

/**
 * A headless `Game`/`LiveGame`/`GameState` with a real constructed story loaded. No DOM.
 *
 * `remounts` counts what tells the two ways of moving apart: restoring a snapshot goes through the
 * whole load path and rebuilds the stage, unwinding in place does not touch it.
 */
function harness() {
    const game = new Game({ app: { debug: false } });
    const counts = { remounts: 0 };
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => { counts.remounts++; },
        next: () => void 0,
    });

    const alice = new Character("Alice");
    const scene = new Scene("s");
    // Six named lines, so a play head has somewhere to move on both sides.
    scene.action([
        alice.setName("A1"), alice.setName("A2"), alice.setName("A3"),
        alice.setName("A4"), alice.setName("A5"), alice.setName("A6"),
    ] as never);
    const story = new Story("t").entry(scene);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);
    liveGame.newGame();

    const actions = story.getAllChildren(story, scene.getSceneRoot())
        .filter(a => a.type === "character:setName");

    return { game, state, story, scene, alice, liveGame, actions, counts };
}

/**
 * Record a line the way playing one does: an action-history entry (whose id becomes the backlog
 * token, as the real push sites do) and a backlog entry carrying a snapshot of the game as the line
 * was reached.
 *
 * `withUndo: false` records the line without an entry in the live undo stack — which is what a line
 * looks like after its save has been loaded, or once the stack's cap has dropped it.
 */
function recordLine(
    liveGame: LiveGame,
    state: GameState,
    action: LogicAction.Actions,
    text: string,
    { withUndo = true }: { withUndo?: boolean } = {}
): string {
    const token = withUndo
        ? state.actionHistory.push({ action, stackModel: liveGame.getStackModelForce() }, () => void 0, []).id
        : `no-undo-${text}`;

    state.gameHistory.push({
        token,
        action,
        element: { type: "say", text, voice: null, character: "Alice" },
        snapshot: liveGame.serializeGameState(),
    });
    return token;
}

const tokensOf = (entries: GameHistory[]) => entries.map(e => e.token);

describe("the timeline and the play head", () => {
    it("starts with everything behind the head and nothing ahead", () => {
        const { liveGame, state, actions } = harness();
        actions.slice(0, 3).forEach((a, i) => recordLine(liveGame, state, a, `L${i}`));

        expect(liveGame.getHistory()).toHaveLength(3);
        expect(liveGame.getFuture()).toEqual([]);
        expect(liveGame.canUndo()).toBe(true);
        expect(liveGame.canRedo()).toBe(false);
    });

    it("moves the head back and forward without losing anything", () => {
        const { liveGame, state, actions } = harness();
        const tokens = actions.slice(0, 4).map((a, i) => recordLine(liveGame, state, a, `L${i}`));

        expect(liveGame.undo()).toBe(true);
        expect(tokensOf(liveGame.getHistory())).toEqual(tokens.slice(0, 3));
        expect(tokensOf(liveGame.getFuture())).toEqual(tokens.slice(3));

        expect(liveGame.redo()).toBe(true);
        expect(tokensOf(liveGame.getHistory())).toEqual(tokens);
        expect(liveGame.getFuture()).toEqual([]);
    });

    it("refuses to move past either end, and says so rather than throwing", () => {
        const { liveGame, state, actions } = harness();
        recordLine(liveGame, state, actions[0], "only");

        expect(liveGame.canUndo()).toBe(false);
        expect(liveGame.undo()).toBe(false);
        expect(liveGame.canRedo()).toBe(false);
        expect(liveGame.redo()).toBe(false);
        // And the head has not moved.
        expect(liveGame.getHistory()).toHaveLength(1);
    });

    it("reaches a line by token in either direction", () => {
        const { liveGame, state, actions } = harness();
        const tokens = actions.slice(0, 4).map((a, i) => recordLine(liveGame, state, a, `L${i}`));

        expect(liveGame.restoreToHistory(tokens[1])).toBe(true);
        expect(liveGame.getHistory()).toHaveLength(2);

        // Forward, to a line that is now ahead of the head — the same call, the other direction.
        expect(liveGame.restoreToHistory(tokens[3])).toBe(true);
        expect(liveGame.getHistory()).toHaveLength(4);
        expect(liveGame.getFuture()).toEqual([]);
    });

    it("returns false for a token no line has", () => {
        const { liveGame, state, actions } = harness();
        recordLine(liveGame, state, actions[0], "L0");

        expect(liveGame.restoreToHistory("nothing-has-this")).toBe(false);
    });
});

describe("what a save carries", () => {
    it("carries the backlog and not the lines ahead of the head", () => {
        const { liveGame, state, actions } = harness();
        actions.slice(0, 4).forEach((a, i) => recordLine(liveGame, state, a, `L${i}`));
        liveGame.undo();
        liveGame.undo();

        expect(liveGame.getFuture()).toHaveLength(2);

        // A save written here is a save of this moment. The two lines the player had read beyond it
        // are not part of it, so loading it opens with nothing to step forward into.
        const save = liveGame.serialize();
        expect(save.game.history).toHaveLength(liveGame.getHistory().length);
        expect(save.meta.version).toBe(3);

        liveGame.deserialize(save);
        expect(liveGame.getFuture()).toEqual([]);
        expect(liveGame.canRedo()).toBe(false);
        expect(liveGame.canUndo()).toBe(true);
    });

    it("opens a loaded save on its last line", () => {
        const { liveGame, state, actions } = harness();
        actions.slice(0, 3).forEach((a, i) => recordLine(liveGame, state, a, `L${i}`));
        const save = liveGame.serialize();

        liveGame.deserialize(save);

        expect(liveGame.getHistory()).toHaveLength(3);
        expect(liveGame.getFuture()).toEqual([]);
    });

    it("keeps every token across the round trip, so a held reference still names its line", () => {
        const { liveGame, state, actions } = harness();
        const tokens = actions.slice(0, 3).map((a, i) => recordLine(liveGame, state, a, `L${i}`));

        liveGame.deserialize(liveGame.serialize());

        expect(tokensOf(liveGame.getHistory())).toEqual(tokens);
        // And the reference still works, which is the point of keeping it.
        expect(liveGame.restoreToHistory(tokens[0])).toBe(true);
    });

    it("carries each line's text, so a loaded save has a readable backlog", () => {
        const { liveGame, state, actions } = harness();
        actions.slice(0, 3).forEach((a, i) => recordLine(liveGame, state, a, `line ${i}`));

        liveGame.deserialize(liveGame.serialize());

        expect(liveGame.getHistory().map(e => (e.element as { text: string }).text))
            .toEqual(["line 0", "line 1", "line 2"]);
    });
});

describe("moving the game to a line", () => {
    it("steps back in place, without rebuilding the stage, when the stack holds the line", () => {
        const { liveGame, state, actions, counts } = harness();
        actions.slice(0, 3).forEach((a, i) => recordLine(liveGame, state, a, `L${i}`));
        const target = liveGame.getHistory()[1];
        expect(state.actionHistory.has(target.token)).toBe(true);

        counts.remounts = 0;
        expect(liveGame.undo()).toBe(true);

        // Nothing was rebuilt. That is the point of preferring this route: restoring a snapshot goes
        // through the load path, which resets the audio manager and remounts the stage, so a step
        // back one line would restart the music and cut every running transition.
        expect(counts.remounts).toBe(0);
        expect(liveGame.getHistory()).toHaveLength(2);
        expect(liveGame.getFuture()).toHaveLength(1);
    });

    it("falls back to the snapshot, rebuilding the stage, for a line the stack cannot reach", () => {
        const { liveGame, state, actions, counts } = harness();
        actions.slice(0, 3).forEach((a, i) =>
            recordLine(liveGame, state, a, `L${i}`, { withUndo: false }));

        // Nothing in the live stack — the state a save leaves behind — and the move still works,
        // which is the whole reason a line carries a snapshot. It costs a rebuild.
        expect(state.actionHistory.getHistory()).toHaveLength(0);
        counts.remounts = 0;
        expect(liveGame.undo()).toBe(true);

        expect(counts.remounts).toBeGreaterThan(0);
        expect(liveGame.getHistory()).toHaveLength(2);
        expect(liveGame.getFuture()).toHaveLength(1);
    });

    it("steps back through a save boundary, which the undo stack alone could not", () => {
        const { liveGame, state, actions } = harness();
        actions.slice(0, 3).forEach((a, i) => recordLine(liveGame, state, a, `L${i}`));

        // Loading is what used to end the story for stepping back: the stack of closures cannot be
        // written to a file, so it comes back empty.
        liveGame.deserialize(liveGame.serialize());
        expect(state.actionHistory.getHistory()).toHaveLength(0);

        expect(liveGame.canUndo()).toBe(true);
        expect(liveGame.undo()).toBe(true);
        expect(liveGame.getHistory()).toHaveLength(2);
        expect(liveGame.canRedo()).toBe(true);
    });

    it("refuses a line whose snapshot could not be captured, rather than moving somewhere wrong", () => {
        const { liveGame, state, actions } = harness();
        recordLine(liveGame, state, actions[0], "L0", { withUndo: false });
        state.gameHistory.push({
            token: "no-snapshot",
            action: actions[1],
            element: { type: "say", text: "L1", voice: null, character: "Alice" },
            snapshot: null,
        });
        recordLine(liveGame, state, actions[2], "L2", { withUndo: false });

        expect(liveGame.restoreToHistory("no-snapshot")).toBe(false);
        // And the head stayed where it was.
        expect(liveGame.getHistory()).toHaveLength(3);
    });

    it("restores the state the line's snapshot describes", () => {
        const { liveGame, state, actions, alice } = harness();
        recordLine(liveGame, state, actions[0], "L0", { withUndo: false });
        const atFirstLine = JSON.stringify(alice.toData());

        alice.state.name = "changed since";
        alice.markDirty();
        recordLine(liveGame, state, actions[1], "L1", { withUndo: false });

        expect(liveGame.undo()).toBe(true);
        expect(JSON.stringify(alice.toData())).toBe(atFirstLine);
    });
});
