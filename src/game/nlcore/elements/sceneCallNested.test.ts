import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Character, Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * Returnable jumps stacked on top of one another.
 *
 * One call is a caller parked behind a callee. Two or three is a chain of them, and the chain is
 * where the parts that look like bookkeeping start to matter: the stage holds every scene in the
 * chain at once, `getLastScene` has to walk past all of them to find the one that is running, the
 * unwind has to come back out in the right order and unload each scene exactly once, and a save
 * written at the bottom has to carry the whole chain - a flag per scene - or the story comes back
 * with the wrong scene live.
 *
 * The depth limit is what keeps that from being unbounded, and it is checked before the caller is
 * parked, so `maxSceneCallDepth` is the number of calls that succeed rather than the number of
 * scenes involved.
 *
 * Scene bodies are `Script` actions rather than dialogue: a line of dialogue settles on a click, and
 * what is asserted here is the order actions run in, not how a click reaches them.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** What the scene bodies ran, in order. */
    log: string[];
    /** Every scene taken off the stage, in the order it left. */
    unloads: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(log: string[], entry: Scene, scenes: Scene[], config: object = {}): Harness {
    const game = new Game({ app: { debug: false }, ...config });
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

    const h: Harness = { game, state, liveGame, log, unloads: [] };

    // Every route out of the stage - a plain jump's `scene:exit`, a call's return, and the wholesale
    // unwind a jump taken mid-call performs - ends here. Counting the calls is how "unloaded exactly
    // once" is asserted without reaching into any of the three.
    const removeScene = state.removeScene.bind(state);
    state.removeScene = (scene: Scene) => {
        if (state.isSceneActive(scene)) {
            h.unloads.push(scene.config.name);
        }
        return removeScene(scene);
    };

    // Stand in for the React tree. Both halves of a scene entering the stage park on a mounted
    // component: `scene:init` waits for the scene's own exposed state, and every layer and image
    // the scene brings with it waits for its own. One stub covers both, mounted for every element
    // the story holds - which is exactly the map a save is restored against.
    const [, elements] = (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
    elements.forEach(element => {
        if (state.isStateMounted(element as never)) {
            return;
        }
        state.mountState(element as never, {
            initDisplayable: (onMounted: VoidFunction) => onMounted(),
            setBackgroundMusic: async (music: Sound | null) => {
                (element as unknown as Scene).state.backgroundMusic = music;
            },
            applyTransform: () => Awaitable.resolve<void>(undefined),
            updateStyleSync: () => void 0,
        } as never);
    });
    void scenes;
    return h;
}

/**
 * Roll the main stack the way the player component does, stopping when it empties, when an
 * awaitable will not settle (nothing here is meant to park), or after `steps` rolls.
 */
async function drive(h: Harness, steps: number = 600): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
            if (!result.isSettled()) {
                throw new Error("drive: parked on an awaitable that never settled");
            }
        }
        await tick();
    }
    throw new Error("drive: ran out of steps");
}

/** Roll until `marker` has been logged, so a test can stop the story mid-chain. */
async function driveUntil(h: Harness, marker: string, steps: number = 600): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.log.includes(marker)) {
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveUntil: story ended before "${marker}" (log: ${h.log.join(",")})`);
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
        }
        await tick();
    }
    throw new Error(`driveUntil: "${marker}" never ran (log: ${h.log.join(",")})`);
}

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

/** Every scene on the stage, in order, with its suspended flag. */
function stage(h: Harness): [name: string, suspended: boolean][] {
    return h.state.getSceneElements().map(element => [element.scene.config.name, element.suspended === true]);
}

const names = (scenes: Scene[]) => scenes.map(scene => scene.config.name);

/**
 * A chain of `depth + 1` scenes, `s0` through `s{depth}`, each calling the next with a returnable
 * jump: `depth` calls, and `depth` scenes parked at the bottom of it.
 *
 * Each scene logs on the way in and on the way out, so the log alone shows both halves of the
 * unwind - `enter` in order down, `leave` in order back up.
 */
function chain(depth: number) {
    const log: string[] = [];
    const scenes = Array.from({ length: depth + 1 }, (_, i) => new Scene("s" + i));
    scenes.forEach((scene, i) => {
        const next = scenes[i + 1];
        scene.action([
            mark(log, "enter-s" + i),
            ...(next ? [scene.jumpTo(next, { returnable: true })] : []),
            mark(log, "leave-s" + i),
        ] as never);
    });
    return { log, scenes };
}

/** The log a whole `chain(depth)` run should produce: all the way down, then all the way back. */
function expectedChainLog(depth: number): string[] {
    const down = Array.from({ length: depth + 1 }, (_, i) => "enter-s" + i);
    const up = Array.from({ length: depth + 1 }, (_, i) => "leave-s" + (depth - i));
    return [...down, ...up];
}

/**
 * The same chain, with a line of dialogue waiting at the bottom of it.
 *
 * A save is written at a moment the player could have pressed the button at, and the only such
 * moment is one where a line is on screen. Saving from the middle of a synchronous run instead
 * re-runs the tail on load - which has nothing to do with scene calls (a single scene of `Script`
 * actions does it too) and would be the only thing such a test measured.
 */
function chainWithLineAtTheBottom(depth: number) {
    const log: string[] = [];
    const speaker = new Character("A");
    const scenes = Array.from({ length: depth + 1 }, (_, i) => new Scene("s" + i));
    scenes.forEach((scene, i) => {
        const next = scenes[i + 1];
        scene.action([
            mark(log, "enter-s" + i),
            ...(next ? [scene.jumpTo(next, { returnable: true })] : [speaker.say("bottom")]),
            mark(log, "leave-s" + i),
        ] as never);
    });
    return { log, scenes };
}

/** The line currently on screen and waiting to be clicked, or null if none is. */
function pendingLine(h: Harness): string | null {
    const history = h.liveGame.getHistory();
    const last = history[history.length - 1];
    return last && last.isPending ? (last.element as { text: string }).text : null;
}

/** Deliver the click the dialogue component would deliver when the player advances a line. */
function clickDialog(h: Harness): boolean {
    for (const element of h.state.getSceneElements()) {
        if (element.texts.length) {
            (element.texts[0] as unknown as { onClick: () => void }).onClick();
            return true;
        }
    }
    return false;
}

/** Roll until `text` is the line on screen, leaving it unclicked - the story stops mid-line. */
async function driveToLine(h: Harness, text: string, steps: number = 600): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (pendingLine(h) === text) {
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveToLine: story ended before "${text}" (log: ${h.log.join(",")})`);
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
    throw new Error(`driveToLine: "${text}" never appeared (log: ${h.log.join(",")})`);
}

/** As {@link drive}, but clicking each line of dialogue as it appears. */
async function driveClicking(h: Harness, steps: number = 600): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        const result = h.liveGame.next();
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result) && !result.isSettled()) {
            await tick();
            if (!result.isSettled() && !clickDialog(h)) {
                throw new Error("driveClicking: parked on an awaitable that never settled");
            }
        }
        await tick();
    }
    throw new Error("driveClicking: ran out of steps");
}

describe("a chain of calls", () => {
    it.each([2, 3])("runs %i deep and unwinds in the order it went in", async (depth) => {
        const { log, scenes } = chain(depth);
        const h = harness(log, scenes[0], scenes);
        h.liveGame.newGame();

        await driveUntil(h, "enter-s" + depth);
        // Every scene in the chain is on the stage at once, and only the innermost is running.
        expect(new Set(names(h.state.getSuspendedScenes()))).toEqual(
            new Set(scenes.slice(0, depth).map(scene => scene.config.name))
        );
        expect(h.state.getSuspendedScenes()).toHaveLength(depth);
        expect(h.state.getLastScene()).toBe(scenes[depth]);
        expect(h.state.getSceneElements()).toHaveLength(depth + 1);

        await drive(h);

        expect(log).toEqual(expectedChainLog(depth));
        // Innermost first: each `scene:resume` unloads the scene its own call had entered.
        expect(h.unloads).toEqual(
            Array.from({ length: depth }, (_, i) => "s" + (depth - i))
        );
        // ...and the outermost is still standing, because nothing called it.
        expect(stage(h)).toEqual([["s0", false]]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });

    it("parks each caller exactly once on the way down", async () => {
        const { log, scenes } = chain(3);
        const h = harness(log, scenes[0], scenes);
        h.liveGame.newGame();

        const depths: number[] = [];
        for (let i = 0; i <= 3; i++) {
            await driveUntil(h, "enter-s" + i);
            depths.push(h.state.getSuspendedScenes().length);
        }

        // One call, one parked scene: the depth the limit is measured against grows by exactly one
        // per call and never by two (which a preSuspend that also suspended would produce).
        expect(depths).toEqual([0, 1, 2, 3]);
    });
});

describe("saving at the bottom of a chain", () => {
    /** Load a save into a fresh run of the same story, and let the render the player would do land. */
    async function loadInto(h: Harness, saved: SavedGame) {
        h.liveGame.newGame();
        h.liveGame.deserialize(JSON.parse(JSON.stringify(saved)) as SavedGame);
        h.state.events.emit(GameState.EventTypes["event:state.onRender"]);
        await tick();
        await tick();
    }

    it.each([2, 3])("carries a %i-deep chain through a save and still unwinds it", async (depth) => {
        const { log, scenes } = chainWithLineAtTheBottom(depth);
        const h = harness(log, scenes[0], scenes);
        h.liveGame.newGame();
        await driveToLine(h, "bottom");

        const saved = h.liveGame.serialize();
        // A flag per scene: every caller in the chain, and not the one that is running.
        const savedFlags = new Map(saved.game.stage.scenes.map(
            scene => [scene.sceneId, scene.suspended === true]
        ));
        scenes.slice(0, depth).forEach(scene => {
            expect(savedFlags.get(scene.getId()), `${scene.config.name} saved as suspended`).toBe(true);
        });
        expect(savedFlags.get(scenes[depth].getId())).toBe(false);

        // A fresh run of the same story, loaded from that save.
        const { log: log2, scenes: scenes2 } = chainWithLineAtTheBottom(depth);
        const h2 = harness(log2, scenes2[0], scenes2);
        await loadInto(h2, saved);

        expect(names(h2.state.getSuspendedScenes()).sort())
            .toEqual(names(scenes2.slice(0, depth)).sort());
        expect(h2.state.getLastScene()).toBe(scenes2[depth]);

        await driveClicking(h2);

        // The whole way back out, from a save written at the bottom: the load resumes on the line
        // the save was written at, so the chain unwinds from there and nothing before it re-runs.
        expect(log2).toEqual(Array.from({ length: depth + 1 }, (_, i) => "leave-s" + (depth - i)));
        expect(h2.unloads).toEqual(Array.from({ length: depth }, (_, i) => "s" + (depth - i)));
        expect(stage(h2)).toEqual([["s0", false]]);
        expect(h2.state.getSuspendedScenes()).toEqual([]);
        // And the run the save came from was left where it was.
        expect(log).toEqual(Array.from({ length: depth + 1 }, (_, i) => "enter-s" + i));
    });
});

describe("the depth limit", () => {
    it("allows exactly maxSceneCallDepth calls with the shipped default", async () => {
        // The default is 8, and the check runs before the caller is parked - so eight calls succeed
        // and the ninth scene is the innermost one, running with eight parked behind it.
        const { log, scenes } = chain(8);
        const h = harness(log, scenes[0], scenes);
        expect(h.game.config.maxSceneCallDepth).toBe(8);
        h.liveGame.newGame();

        await drive(h);
        expect(log).toEqual(expectedChainLog(8));
        expect(h.state.getSceneElements()).toHaveLength(1);
    });

    it("refuses the call one past the default", async () => {
        const { log, scenes } = chain(9);
        const h = harness(log, scenes[0], scenes);
        h.liveGame.newGame();

        await expect(drive(h)).rejects.toThrow(/call depth limit reached \(8\)/);
        // It got all the way down to the ninth scene and refused the call out of it, so the stage is
        // exactly what it was: nothing was half-entered by the refusal.
        expect(log).toEqual(Array.from({ length: 9 }, (_, i) => "enter-s" + i));
        expect(h.state.getSuspendedScenes()).toHaveLength(8);
        expect(h.state.getSceneElements()).toHaveLength(9);
    });

    it("takes a lower limit from the game config", async () => {
        const { log, scenes } = chain(3);
        const h = harness(log, scenes[0], scenes, { maxSceneCallDepth: 3 });
        expect(h.game.config.maxSceneCallDepth).toBe(3);
        h.liveGame.newGame();

        await drive(h);
        expect(log).toEqual(expectedChainLog(3));
    });

    it("refuses the call one past a limit taken from the game config", async () => {
        const { log, scenes } = chain(4);
        const h = harness(log, scenes[0], scenes, { maxSceneCallDepth: 3 });
        h.liveGame.newGame();

        await expect(drive(h)).rejects.toThrow(/call depth limit reached \(3\)/);
        expect(log).toEqual(["enter-s0", "enter-s1", "enter-s2", "enter-s3"]);
        expect(h.state.getSuspendedScenes()).toHaveLength(3);
    });

    it("takes a higher limit from the game config, so a story can ask to go deeper", async () => {
        const { log, scenes } = chain(9);
        const h = harness(log, scenes[0], scenes, { maxSceneCallDepth: 12 });
        h.liveGame.newGame();

        // The same chain that is refused on the default runs through when the story raises the
        // limit, which is what the message tells the author to do.
        await drive(h);
        expect(log).toEqual(expectedChainLog(9));
        // Nine scenes enter and leave the stage in one test, and each entrance waits on its own
        // mounted state, so this sits close to the default per-test budget on a loaded machine.
        // Nine is the shortest chain that exceeds the default limit, so the cost is the property.
    }, 20_000);
});

describe("a plain jump taken from the bottom of a chain", () => {
    it("unloads every parked scene and leaves only the scene jumped to", async () => {
        const log: string[] = [];
        const away = new Scene("away");
        const scenes = [0, 1, 2, 3].map(i => new Scene("s" + i));
        away.action([mark(log, "away")] as never);
        scenes.forEach((scene, i) => {
            const next = scenes[i + 1];
            scene.action([
                mark(log, "enter-s" + i),
                ...(next ? [scene.jumpTo(next, { returnable: true })] : [scene.jumpTo(away)]),
                mark(log, "leave-s" + i),
            ] as never);
        });

        const h = harness(log, scenes[0], [...scenes, away]);
        h.liveGame.newGame();
        await driveUntil(h, "enter-s3");
        expect(h.state.getSuspendedScenes()).toHaveLength(3);

        await drive(h);

        // A plain jump is one-way and it takes the whole call stack with it: no `leave-` line is
        // ever reached, because the frames that would have returned to them are gone.
        expect(log).toEqual(["enter-s0", "enter-s1", "enter-s2", "enter-s3", "away"]);
        expect(stage(h)).toEqual([["away", false]]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
        // Four scenes left the stage - the three parked callers and the one that jumped - each once.
        expect(h.unloads.sort()).toEqual(["s0", "s1", "s2", "s3"]);
    });
});

describe("the scene the story is running in", () => {
    it("is the innermost scene at every depth from none to three", async () => {
        const { log, scenes } = chain(3);
        const h = harness(log, scenes[0], scenes);
        h.liveGame.newGame();

        for (let depth = 0; depth <= 3; depth++) {
            await driveUntil(h, "enter-s" + depth);
            expect(h.state.getSuspendedScenes()).toHaveLength(depth);
            // With `depth` scenes parked, the running scene is the one at the bottom - which is what
            // dialogue, menus, voice lookup and new displayables all attach to.
            expect(h.state.getLastScene(), `at depth ${depth}`).toBe(scenes[depth]);
        }

        // And on the way back out again, one scene at a time.
        for (let depth = 3; depth >= 0; depth--) {
            await driveUntil(h, "leave-s" + depth);
            expect(h.state.getSuspendedScenes()).toHaveLength(depth);
            expect(h.state.getLastScene(), `unwinding at depth ${depth}`).toBe(scenes[depth]);
        }
    });

    it("is still the innermost scene after a save and load at depth three", async () => {
        const { log, scenes } = chainWithLineAtTheBottom(3);
        const h = harness(log, scenes[0], scenes);
        h.liveGame.newGame();
        await driveToLine(h, "bottom");
        const saved = h.liveGame.serialize();

        const { log: log2, scenes: scenes2 } = chainWithLineAtTheBottom(3);
        const h2 = harness(log2, scenes2[0], scenes2);
        h2.liveGame.newGame();
        h2.liveGame.deserialize(JSON.parse(JSON.stringify(saved)) as SavedGame);
        h2.state.events.emit(GameState.EventTypes["event:state.onRender"]);
        await tick();
        await tick();

        // A save carries the flags, not the walk - so this is the assertion that the flags came back
        // on the right scenes. Three wrong flags and this would name a parked caller.
        expect(h2.state.getLastScene()).toBe(scenes2[3]);
        expect(h2.state.getSceneElements()).toHaveLength(4);
        expect(names(h2.state.getSuspendedScenes()).sort()).toEqual(["s0", "s1", "s2"]);
    });

    it("is the only unsuspended scene, whatever order the stage holds them in", async () => {
        const { log, scenes } = chain(3);
        const h = harness(log, scenes[0], scenes);
        h.liveGame.newGame();
        await driveUntil(h, "enter-s3");

        // `getLastScene` walks the element list from the end past anything suspended. The list is
        // built newest-first (`addScene` unshifts), so the walk only lands on the right scene
        // because exactly one element is unsuspended - not because of where it sits.
        const unsuspended = h.state.getSceneElements().filter(element => !element.suspended);
        expect(unsuspended).toHaveLength(1);
        expect(unsuspended[0].scene).toBe(h.state.getLastScene());
    });
});
