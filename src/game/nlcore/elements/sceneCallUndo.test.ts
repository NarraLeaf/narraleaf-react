import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Character, Game, Scene, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { GameHistory } from "@core/action/gameHistory";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * Stepping a returnable jump backwards and forwards through the API a player's UI actually calls:
 * `liveGame.undo()`, `liveGame.redo()` and `liveGame.restoreToHistory()`.
 *
 * Those three move a play head over the *backlog* - the list of dialogue lines - and reach a line
 * one of two ways: in place, by unwinding the undo each action registered as it ran, or by restoring
 * the line's snapshot through the whole load path. Which route is taken is not the caller's choice:
 * it depends on which direction the head moves and whether the live undo stack still holds the line.
 * A call boundary has to survive both, and has to land in the same place either way, because the
 * same button takes both routes depending only on how far back the player has already gone.
 *
 * So the stories here are made of `character.say` rather than `Script.execute`: a `Script` action
 * records nothing in the backlog, and a backlog with nothing in it is a play head with nowhere to
 * go. The one thing a node test cannot supply is the React tree, so each scene's exposed state is
 * mounted by hand and the click that settles a line is delivered straight to the waitable the
 * dialogue component would have wired to a click.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** Scene music starts and audio transport calls, interleaved in the order they happened. */
    audio: string[];
    /** The name of the scene each dialogue line was attached to, in the order they appeared. */
    dialogScenes: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(entry: Scene, scenes: Scene[]): Harness {
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

    const h: Harness = { game, state, liveGame, audio: [], dialogScenes: [] };

    // Stand in for the React tree. Both halves of a scene entering the stage park on a mounted
    // component: `scene:init` waits for the scene's own exposed state, and every layer and image
    // the scene brings with it waits for its own. One stub covers both, mounted for every element
    // the story holds - which is exactly the map a save is restored against.
    const sceneNames = new Map(scenes.map(scene => [scene, scene.config.name]));
    const [, elements] = (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
    elements.forEach(element => {
        if (state.isStateMounted(element as never)) {
            return;
        }
        state.mountState(element as never, {
            initDisplayable: (onMounted: VoidFunction) => onMounted(),
            setBackgroundMusic: async (music: Sound | null, fade: number) => {
                const scene = element as unknown as Scene;
                h.audio.push(`play:${sceneNames.get(scene) ?? "?"}:${music ? music.config.src : "none"}:${fade}`);
                scene.state.backgroundMusic = music;
            },
            // Every restore ends by re-applying each displayable's pose, because a component that
            // did not re-render would keep the pose of the line being left. There is no component
            // here, so the pose lands nowhere - but the call still has to answer.
            applyTransform: () => Awaitable.resolve<void>(undefined),
            updateStyleSync: () => void 0,
        } as never);
    });
    return h;
}

/**
 * Deliver the click that settles the line on screen, and record which scene was showing it.
 *
 * The dialogue component pushes a waitable onto the scene it belongs to and calls it back when the
 * player clicks; this is that call. Which scene holds it is worth recording on the way past: a line
 * that landed on a suspended caller would be a line the player cannot see.
 */
function clickDialog(h: Harness): boolean {
    for (const element of h.state.getSceneElements()) {
        if (element.texts.length) {
            h.dialogScenes.push(element.scene.config.name);
            (element.texts[0] as unknown as { onClick: () => void }).onClick();
            return true;
        }
    }
    return false;
}

/**
 * Roll the main stack the way the player component does, clicking each line as it appears, and
 * stopping when the stack empties, when an awaitable will not settle, or after `steps` rolls.
 */
async function drive(h: Harness, steps: number = 600): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
            if (!result.isSettled() && !clickDialog(h)) {
                throw new Error("drive: parked on an awaitable that never settled");
            }
        }
        await tick();
    }
    throw new Error("drive: ran out of steps");
}

/** The line currently on screen and waiting to be clicked, or null if none is. */
function pendingLine(h: Harness): string | null {
    const history = h.liveGame.getHistory();
    const last = history[history.length - 1];
    return last && last.isPending ? (last.element as { text: string }).text : null;
}

/** Roll until `text` is the line on screen, leaving it unclicked - the story stops mid-line. */
async function driveToLine(h: Harness, text: string, steps: number = 600): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (pendingLine(h) === text) {
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveToLine: story ended before "${text}" (backlog: ${texts(h).join(",")})`);
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
    throw new Error(`driveToLine: "${text}" never appeared (backlog: ${texts(h).join(",")})`);
}

/**
 * Let a restore land.
 *
 * Restoring a snapshot goes through the load path, which locks the roll and waits for the stage to
 * render before unlocking it. The player emits that event; here it is emitted by hand. Harmless on
 * the in-place route, which never arms the listener.
 */
async function settle(h: Harness): Promise<void> {
    h.state.events.emit(GameState.EventTypes["event:state.onRender"]);
    await tick();
    await tick();
}

/** The backlog as plain text, which is what a player would be reading. */
function texts(h: Harness): string[] {
    return h.liveGame.getHistory().map(entry => (entry.element as { text: string }).text);
}

/** Every scene on the stage, in order, with its suspended flag. */
function stage(h: Harness): [name: string, suspended: boolean][] {
    return h.state.getSceneElements().map(element => [element.scene.config.name, element.suspended === true]);
}

/** The action the play head is on, read the way a debug view reads it. */
function position(h: Harness): string | null {
    return h.liveGame.getStackSnapshot().root.frames[0]?.actionId ?? null;
}

/**
 * The resumable core of the game as a string: store, elements, stage and execution stacks.
 *
 * `serialize()` is not usable for a byte comparison - its meta carries a timestamp - and the backlog
 * is deliberately left out too, because the play head moving is exactly what is being compared
 * around. This is the same unit a per-line snapshot is made of, so two states that stringify the
 * same here restore to the same game.
 */
function core(h: Harness): string {
    return JSON.stringify(h.liveGame.serializeGameState());
}

/** A story shaped `main: A1 -> call(sub) -> A2`, with `sub: B1 -> B2`. */
function callStory() {
    const alice = new Character("Alice");
    const sub = new Scene("sub");
    const main = new Scene("main");
    sub.action([alice.say("B1"), alice.say("B2")] as never);
    main.action([
        alice.say("A1"),
        main.jumpTo(sub, { returnable: true }),
        alice.say("A2"),
    ] as never);
    return { alice, main, sub };
}

async function ranCallStory() {
    const { main, sub } = callStory();
    const h = harness(main, [main, sub]);
    h.liveGame.newGame();
    await drive(h);
    return { h, main, sub };
}

const tokensOf = (entries: GameHistory[]) => entries.map(entry => entry.token);

describe("stepping back through the public undo, across a call", () => {
    it("reads the whole call as one backlog, and lines never land on the parked caller", async () => {
        const { h } = await ranCallStory();

        // The premise everything below rests on: a call is not a separate story with its own
        // backlog, it is four lines in a row.
        expect(texts(h)).toEqual(["A1", "B1", "B2", "A2"]);
        // And every one of them was shown by the scene that was actually running.
        expect(h.dialogScenes).toEqual(["main", "sub", "sub", "main"]);
    });

    it("steps back line by line out of the call, and the stage follows each step", async () => {
        const { h } = await ranCallStory();
        const timeline = h.liveGame.getHistory().map(entry => entry.action.getId());

        // Standing on A2: the call has returned, the callee is gone, nothing is parked.
        expect(stage(h)).toEqual([["main", false]]);

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(texts(h)).toEqual(["A1", "B1", "B2"]);
        expect(position(h)).toBe(timeline[2]);
        // B2 is a line inside the callee, so the callee is back and the caller is parked again.
        expect(new Map(stage(h))).toEqual(new Map([["main", true], ["sub", false]]));

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(texts(h)).toEqual(["A1", "B1"]);
        expect(position(h)).toBe(timeline[1]);
        expect(new Map(stage(h))).toEqual(new Map([["main", true], ["sub", false]]));

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(texts(h)).toEqual(["A1"]);
        expect(position(h)).toBe(timeline[0]);
        // A1 is before the jump: the callee was never mounted and nothing is parked.
        expect(stage(h)).toEqual([["main", false]]);

        // And there is nothing before the first line.
        expect(h.liveGame.canUndo()).toBe(false);
        expect(h.liveGame.undo()).toBe(false);
    });

    it("undoing the return brings the callee back and parks the caller again", async () => {
        const { h, main, sub } = await ranCallStory();
        expect(h.state.isSceneActive(sub)).toBe(false);

        expect(h.liveGame.undo()).toBe(true);
        await settle(h);

        expect(h.state.isSceneActive(sub)).toBe(true);
        expect(h.state.isSceneSuspended(main)).toBe(true);
        expect(h.state.getSuspendedScenes()).toEqual([main]);
        // The scene the next line would attach to is the callee, as it was mid-call.
        expect(h.state.getLastScene()).toBe(sub);
    });

    it("undoing out of the call leaves nothing suspended and no callee on the stage", async () => {
        const { h, main, sub } = await ranCallStory();

        while (h.liveGame.canUndo()) {
            expect(h.liveGame.undo()).toBe(true);
            await settle(h);
        }

        expect(texts(h)).toEqual(["A1"]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
        expect(h.state.isSceneSuspended(main)).toBe(false);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.getLastScene()).toBe(main);
        // Nothing is left of the callee in a save written here either.
        expect(h.liveGame.serializeGameState().stage.scenes.map(scene => scene.sceneId))
            .toEqual([main.getId()]);
    });

    it("carries on from where it stepped back to, rather than replaying what came after", async () => {
        const { h } = await ranCallStory();

        // Back to the line before the call, then read forward again: the same four lines, in the
        // same order, with the call taken a second time.
        expect(h.liveGame.undo()).toBe(true);
        expect(h.liveGame.undo()).toBe(true);
        expect(h.liveGame.undo()).toBe(true);
        await settle(h);
        expect(texts(h)).toEqual(["A1"]);

        await drive(h);
        expect(texts(h)).toEqual(["A1", "B1", "B2", "A2"]);
        expect(stage(h)).toEqual([["main", false]]);
    });
});

describe("stepping forward again through the public redo", () => {
    it("reaches the same last line it stepped back from, in the same state", async () => {
        const { main, sub } = callStory();
        const h = harness(main, [main, sub]);
        h.liveGame.newGame();

        // Standing on the line after the call, with the call already returned. Compared against
        // the same logical point rather than "the story has ended", because a play head cannot be
        // put past its last line and comparing the two would be comparing different moments.
        await driveToLine(h, "A2");
        const atA2 = core(h);
        const timeline = tokensOf(h.liveGame.getHistory());

        while (h.liveGame.canUndo()) {
            h.liveGame.undo();
            await settle(h);
        }
        expect(texts(h)).toEqual(["A1"]);

        while (h.liveGame.canRedo()) {
            expect(h.liveGame.redo()).toBe(true);
            await settle(h);
        }

        expect(texts(h)).toEqual(["A1", "B1", "B2", "A2"]);
        // Every line kept the token it had, so a backlog UI holding one still names its line.
        expect(tokensOf(h.liveGame.getHistory())).toEqual(timeline);
        expect(core(h)).toBe(atA2);

        // And the story still ends from there.
        await drive(h);
        expect(stage(h)).toEqual([["main", false]]);
    });

    it("puts the callee back on the way forward through the call, and takes it away on the return", async () => {
        const { h, main, sub } = await ranCallStory();

        while (h.liveGame.canUndo()) {
            h.liveGame.undo();
            await settle(h);
        }
        expect(h.state.isSceneActive(sub)).toBe(false);

        // Forward onto B1, the first line inside the callee.
        expect(h.liveGame.redo()).toBe(true);
        await settle(h);
        expect(texts(h)).toEqual(["A1", "B1"]);
        expect(h.state.isSceneActive(sub)).toBe(true);
        expect(h.state.isSceneSuspended(main)).toBe(true);
        expect(h.state.getLastScene()).toBe(sub);

        // Forward onto B2, still inside.
        expect(h.liveGame.redo()).toBe(true);
        await settle(h);
        expect(h.state.isSceneSuspended(main)).toBe(true);

        // Forward onto A2, the line after the jump: the call has returned.
        expect(h.liveGame.redo()).toBe(true);
        await settle(h);
        expect(texts(h)).toEqual(["A1", "B1", "B2", "A2"]);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.isSceneSuspended(main)).toBe(false);
        expect(h.state.getLastScene()).toBe(main);

        expect(h.liveGame.canRedo()).toBe(false);
        expect(h.liveGame.redo()).toBe(false);
    });

    it("matches, line for line, the state the same line had on the way through", async () => {
        const { main, sub } = callStory();
        const h = harness(main, [main, sub]);
        h.liveGame.newGame();

        // The state as each line was first reached, recorded on the way through.
        const first: Record<string, string> = {};
        for (const line of ["A1", "B1", "B2", "A2"]) {
            await driveToLine(h, line);
            first[line] = core(h);
        }
        await drive(h);

        // ...and again on the way back, reached by stepping the play head instead of playing.
        while (h.liveGame.canUndo()) {
            h.liveGame.undo();
            await settle(h);
            const line = texts(h)[texts(h).length - 1];
            expect(core(h), `stepping back onto ${line}`).toBe(first[line]);
        }

        // ...and once more on the way forward.
        while (h.liveGame.canRedo()) {
            h.liveGame.redo();
            await settle(h);
            const line = texts(h)[texts(h).length - 1];
            expect(core(h), `stepping forward onto ${line}`).toBe(first[line]);
        }
    });

    it("drifts nowhere over three undo/redo cycles", async () => {
        const { h } = await ranCallStory();

        const insideTheCall: string[] = [];
        const afterTheCall: string[] = [];
        for (let cycle = 0; cycle < 3; cycle++) {
            while (h.liveGame.canUndo()) {
                h.liveGame.undo();
                await settle(h);
            }
            // Forward to B1: a line inside the callee, reached the same way each time.
            h.liveGame.redo();
            await settle(h);
            expect(texts(h)).toEqual(["A1", "B1"]);
            insideTheCall.push(core(h));

            while (h.liveGame.canRedo()) {
                h.liveGame.redo();
                await settle(h);
            }
            expect(texts(h)).toEqual(["A1", "B1", "B2", "A2"]);
            afterTheCall.push(core(h));
        }

        expect(new Set(insideTheCall).size, "state at B1 differs across cycles").toBe(1);
        expect(new Set(afterTheCall).size, "state at A2 differs across cycles").toBe(1);
    });
});

describe("jumping to a line by token", () => {
    it("reaches a line inside the callee from the caller, after the call has already returned", async () => {
        const { h, main, sub } = await ranCallStory();
        const insideTheCall = h.liveGame.getHistory().find(
            entry => (entry.element as { text: string }).text === "B1"
        )!;
        expect(insideTheCall).toBeDefined();

        // Standing after the return, in the caller, with the callee unloaded - and asking for a line
        // that only exists while the callee is on the stage.
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.liveGame.restoreToHistory(insideTheCall.token)).toBe(true);
        await settle(h);

        expect(texts(h)).toEqual(["A1", "B1"]);
        expect(h.state.isSceneActive(sub)).toBe(true);
        expect(h.state.isSceneSuspended(main)).toBe(true);
        expect(h.state.getLastScene()).toBe(sub);
        // The rest of the backlog is a future, not a loss.
        expect(h.liveGame.getFuture().map(entry => (entry.element as { text: string }).text))
            .toEqual(["B2", "A2"]);

        // And the story runs on from there, through the return, exactly as it did the first time.
        await drive(h);
        expect(texts(h)).toEqual(["A1", "B1", "B2", "A2"]);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.isSceneSuspended(main)).toBe(false);
    });
});

describe("stepping back across a save", () => {
    /** Load a save into a fresh run of the same story, and let the render the player would do land. */
    async function loadInto(h: Harness, saved: SavedGame) {
        h.liveGame.newGame();
        h.liveGame.deserialize(JSON.parse(JSON.stringify(saved)) as SavedGame);
        await settle(h);
    }

    it("steps back out of a call that was saved into", async () => {
        const { main, sub } = callStory();
        const h = harness(main, [main, sub]);
        h.liveGame.newGame();
        await driveToLine(h, "B2");
        const saved = h.liveGame.serialize();
        expect(saved.game.stage.scenes.find(scene => scene.sceneId === main.getId())?.suspended).toBe(true);

        const { main: main2, sub: sub2 } = callStory();
        const h2 = harness(main2, [main2, sub2]);
        await loadInto(h2, saved);

        // A load leaves no live undo stack behind, so every step back here has to go through the
        // line's own snapshot - the route that exists precisely for this.
        expect(h2.state.actionHistory.getHistory()).toHaveLength(0);
        expect(texts(h2)).toEqual(["A1", "B1", "B2"]);
        expect(h2.state.isSceneSuspended(main2)).toBe(true);

        // Back one line: still inside the call.
        expect(h2.liveGame.undo()).toBe(true);
        await settle(h2);
        expect(texts(h2)).toEqual(["A1", "B1"]);
        expect(h2.state.isSceneSuspended(main2)).toBe(true);
        expect(h2.state.isSceneActive(sub2)).toBe(true);

        // Back one more: across the call boundary, to before the jump was taken.
        expect(h2.liveGame.undo()).toBe(true);
        await settle(h2);
        expect(texts(h2)).toEqual(["A1"]);
        expect(h2.state.getSuspendedScenes()).toEqual([]);
        expect(h2.state.isSceneActive(sub2)).toBe(false);
        expect(h2.state.getLastScene()).toBe(main2);

        // And forward again, taking the call a second time from a loaded save.
        await drive(h2);
        expect(texts(h2)).toEqual(["A1", "B1", "B2", "A2"]);
        expect(h2.state.isSceneActive(sub2)).toBe(false);
        expect(h2.state.isSceneSuspended(main2)).toBe(false);
    });

    it("steps back the same way whether or not a save came between", async () => {
        const { main, sub } = callStory();
        const h = harness(main, [main, sub]);
        h.liveGame.newGame();
        await driveToLine(h, "B2");

        // One run steps straight back; the other is saved, loaded, and then steps back. Those are
        // the two routes through `restoreToIndex` - unwinding in place, and restoring the line's
        // snapshot - and they have to agree, because which one a player gets depends only on
        // whether they have loaded a save since.
        const saved = h.liveGame.serialize();
        h.liveGame.undo();
        await settle(h);

        const { main: main2, sub: sub2 } = callStory();
        const h2 = harness(main2, [main2, sub2]);
        await loadInto(h2, saved);
        h2.liveGame.undo();
        await settle(h2);

        expect(new Map(stage(h2))).toEqual(new Map(stage(h)));
        expect(texts(h2)).toEqual(texts(h));
        // Named rather than compared as objects: the two runs hold two different `Scene` instances
        // of the same story.
        expect(h2.state.getSuspendedScenes().map(scene => scene.config.name))
            .toEqual(h.state.getSuspendedScenes().map(scene => scene.config.name));
        expect(h2.state.getLastScene()?.config.name).toBe(h.state.getLastScene()?.config.name);
        expect(h2.state.isSceneSuspended(main2)).toBe(h.state.isSceneSuspended(main));
        expect(h2.state.isSceneActive(sub2)).toBe(h.state.isSceneActive(sub));
    });
});
