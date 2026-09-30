import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Control, Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { SceneActionTypes } from "@core/action/actionTypes";
import { StackModel } from "@core/action/stackModel";
import { Awaitable } from "@lib/util/data";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import { SceneAction } from "@core/action/actions/sceneAction";
import { ExposedStateType } from "@player/type";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * A returnable jump: `scene.jumpTo(target, {returnable: true})`.
 *
 * The calling scene is suspended rather than unloaded - it keeps its stage, its layers and its
 * local variables, its music is paused, and it stops being the scene new dialogue attaches to. When
 * the called scene runs out of actions the stack falls through to the `scene:resume` the call left
 * underneath it, and the story carries on at the line after the jump.
 *
 * Everything here is driven through a real `Game`/`GameState`/`LiveGame` rather than a duck-typed
 * seam, because what this feature changes is exactly the state those three hold between them: which
 * scenes are mounted, which of them is live, and what a save says about both. The one thing a node
 * test cannot supply is the React tree, so each scene's exposed state is mounted by hand - that is
 * what makes `scene:init` resolve rather than park on a component that never mounts, and it is the
 * only stand-in in the file.
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
    /** Scene music starts and audio transport calls, interleaved in the order they happened. */
    audio: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(log: string[], entry: Scene, scenes: Scene[]): Harness {
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

    const h: Harness = { game, state, liveGame, log, audio: [] };

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
        } as never);
    });
    return h;
}

/**
 * Record the audio transport instead of performing it.
 *
 * The audio manager is real but holds nothing - there is no audio context in node, so it manages no
 * sound and every transport call would be a no-op. What is under test is which call is made against
 * which track with which fade, not what the web audio graph does with it.
 */
function recordAudio(h: Harness): void {
    h.state.audioManager.isManaged = () => true;
    h.state.audioManager.pause = ((sound: Sound, duration: number) => {
        h.audio.push(`pause:${sound.config.src}:${duration}`);
        return Awaitable.resolve<void>(undefined);
    }) as never;
    h.state.audioManager.resume = ((sound: Sound, duration: number) => {
        h.audio.push(`resume:${sound.config.src}:${duration}`);
        return Awaitable.resolve<void>(undefined);
    }) as never;
}

/**
 * Roll the main stack the way the player component does, stopping when it empties, when an
 * awaitable will not settle (nothing here is meant to park), or after `steps` rolls.
 */
async function drive(h: Harness, steps: number = 400): Promise<void> {
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

/** Roll until `marker` has been logged, so a test can stop the story mid-call. */
async function driveUntil(h: Harness, marker: string, steps: number = 400): Promise<void> {
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

/** Every action reachable from a scene root down the linear child chain. */
function linearActions(scene: Scene): LogicAction.Actions[] {
    const acts: LogicAction.Actions[] = [];
    const seen = new Set<object>();
    let node: ReturnType<typeof scene.getSceneRoot>["contentNode"] | null = scene.getSceneRoot().contentNode;
    while (node && !seen.has(node)) {
        seen.add(node);
        if (node.action) acts.push(node.action);
        node = node.getChild();
    }
    return acts;
}

/**
 * Action types this scene owns, its `Control.do` bodies included.
 *
 * Filtered by callee rather than scoped with `allowFutureScene: false`: that option also stops the
 * walk at the `Control.do` a jump is built inside, which is where the interesting actions are. The
 * callee filter reaches them and still leaves out everything the scene a jump reaches owns.
 */
function chainTypes(scene: Scene, story: Story): string[] {
    return scene
        .getAllChildren(story, scene.getSceneRoot(), { allowFutureScene: true })
        .filter(action => action.callee === scene)
        .map(action => action.type);
}

/** A story shaped `main: A1 -> call(sub) -> A2`, with `sub: B1`. */
function callStory() {
    const log: string[] = [];
    const sub = new Scene("sub");
    const main = new Scene("main");
    sub.action([mark(log, "B1")] as never);
    main.action([
        mark(log, "A1"),
        main.jumpTo(sub, { returnable: true }),
        mark(log, "A2"),
    ] as never);
    return { log, main, sub };
}

describe("a plain jump is unchanged", () => {
    it("still builds preUnmount / exit / jumpTo and nothing of the call machinery", () => {
        const sub = new Scene("sub");
        const main = new Scene("main");
        main.action([main.jumpTo(sub)] as never);
        const story = new Story("t").entry(main);
        story.constructStory();

        const types = chainTypes(main, story);
        expect(types).toContain(SceneActionTypes.preUnmount);
        expect(types).toContain(SceneActionTypes.exit);
        expect(types).toContain(SceneActionTypes.jumpTo);
        expect(types).not.toContain(SceneActionTypes.callTo);
        expect(types).not.toContain(SceneActionTypes.resume);
        expect(types).not.toContain(SceneActionTypes.preSuspend);
    });

    it("builds the same chain with no config, an empty config, and returnable: false", () => {
        const build = (config?: object) => {
            const sub = new Scene("sub");
            const main = new Scene("main");
            main.action([config ? main.jumpTo(sub, config) : main.jumpTo(sub)] as never);
            const story = new Story("t").entry(main);
            story.constructStory();
            return chainTypes(main, story);
        };
        expect(build({})).toEqual(build());
        expect(build({ returnable: false })).toEqual(build());
    });

    it("unloads the calling scene and suspends nothing", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "sub")] as never);
        main.action([mark(log, "main"), main.jumpTo(sub), mark(log, "unreachable")] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["main", "sub"]);
        expect(h.state.isSceneActive(main)).toBe(false);
        expect(h.state.isSceneActive(sub)).toBe(true);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });
});

describe("the shape a returnable jump builds", () => {
    it("builds preSuspend / callTo / resume, and neither preUnmount nor exit", () => {
        const { main } = callStory();
        const story = new Story("t").entry(main);
        story.constructStory();

        const types = chainTypes(main, story);
        expect(types).toContain(SceneActionTypes.preSuspend);
        expect(types).toContain(SceneActionTypes.callTo);
        expect(types).toContain(SceneActionTypes.resume);
        expect(types).not.toContain(SceneActionTypes.preUnmount);
        expect(types).not.toContain(SceneActionTypes.exit);
    });

    it("puts the resume action directly behind the call, so the call has a return address", () => {
        const { main } = callStory();
        new Story("t").entry(main).constructStory();

        const actions = linearActions(main);
        const callIndex = actions.findIndex(a => a.type === SceneActionTypes.callTo);
        expect(callIndex).toBeGreaterThanOrEqual(0);
        expect(actions[callIndex].contentNode.getChild()?.action?.type).toBe(SceneActionTypes.resume);
    });
});

describe("running a call and coming back", () => {
    it("keeps the caller mounted, suspended, and out of the way while the callee runs", async () => {
        const { log, main, sub } = callStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");

        expect(h.state.isSceneActive(main)).toBe(true);
        expect(h.state.isSceneActive(sub)).toBe(true);
        expect(h.state.isSceneSuspended(main)).toBe(true);
        expect(h.state.getSuspendedScenes()).toEqual([main]);
        // The scene new dialogue would attach to is the called one, not the parked caller.
        expect(h.state.getLastScene()).toBe(sub);
    });

    it("returns to the action after the jump and unloads the called scene", async () => {
        const { log, main, sub } = callStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "B1", "A2"]);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.isSceneActive(main)).toBe(true);
        expect(h.state.isSceneSuspended(main)).toBe(false);
        expect(h.state.getLastScene()).toBe(main);
    });

    it("runs a chain of calls and unwinds it in order", async () => {
        const log: string[] = [];
        const inner = new Scene("inner");
        const middle = new Scene("middle");
        const outer = new Scene("outer");
        inner.action([mark(log, "C1")] as never);
        middle.action([mark(log, "B1"), middle.jumpTo(inner, { returnable: true }), mark(log, "B2")] as never);
        outer.action([mark(log, "A1"), outer.jumpTo(middle, { returnable: true }), mark(log, "A2")] as never);

        const h = harness(log, outer, [outer, middle, inner]);
        h.liveGame.newGame();
        await driveUntil(h, "C1");

        expect(h.state.getSuspendedScenes()).toEqual([middle, outer]);
        expect(h.state.getLastScene()).toBe(inner);

        await drive(h);
        expect(log).toEqual(["A1", "B1", "C1", "B2", "A2"]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });
});

describe("guards", () => {
    it("refuses to call a scene that is already on the call stack", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        // `sub` calls `main` back. `main` is suspended rather than gone, so there is nowhere to put
        // a second copy of it - one Scene owns one place on the stage.
        sub.action([mark(log, "B1"), sub.jumpTo(main, { returnable: true })] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub, { returnable: true }), mark(log, "A2")] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();

        await expect(drive(h)).rejects.toThrow(/already on stage/);
    });

    it("refuses to go deeper than maxSceneCallDepth", async () => {
        const log: string[] = [];
        const scenes = [0, 1, 2, 3].map(i => new Scene("s" + i));
        scenes.forEach((scene, i) => {
            const next = scenes[i + 1];
            scene.action([
                mark(log, "s" + i),
                ...(next ? [scene.jumpTo(next, { returnable: true })] : []),
            ] as never);
        });

        const h = harness(log, scenes[0], scenes);
        (h.game.config as { maxSceneCallDepth: number }).maxSceneCallDepth = 2;
        h.liveGame.newGame();

        await expect(drive(h)).rejects.toThrow(/call depth limit reached \(2\)/);
        expect(log).toEqual(["s0", "s1", "s2"]);
    });
});

describe("background music", () => {
    function musicStory() {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme, backgroundMusicFade: 250 });
        sub.action([mark(log, "B1")] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub, { returnable: true }), mark(log, "A2")] as never);
        return { log, main, sub, theme };
    }

    it("pauses the caller's track on the way in and resumes it on the way out", async () => {
        const { log, main, sub } = musicStory();
        const h = harness(log, main, [main, sub]);
        recordAudio(h);

        h.liveGame.newGame();
        await driveUntil(h, "B1");
        expect(h.audio.filter(entry => entry.startsWith("pause:"))).toEqual(["pause:/theme.mp3:250"]);

        await drive(h);
        expect(h.audio.filter(entry => !entry.startsWith("play:"))).toEqual([
            "pause:/theme.mp3:250",
            "resume:/theme.mp3:250",
        ]);
    });

    it("pauses the caller's track before the called scene asks for its own", async () => {
        const other = Sound.bgm({ src: "/other.mp3" });
        const theme = Sound.bgm({ src: "/theme.mp3" });
        const log: string[] = [];
        const sub = new Scene("sub", { backgroundMusic: other });
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([mark(log, "B1")] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub, { returnable: true })] as never);

        const h = harness(log, main, [main, sub]);
        recordAudio(h);

        h.liveGame.newGame();
        await driveUntil(h, "B1");

        const pauseAt = h.audio.findIndex(entry => entry === "pause:/theme.mp3:0");
        const startAt = h.audio.findIndex(entry => entry.startsWith("play:sub:/other.mp3"));
        expect(pauseAt).toBeGreaterThanOrEqual(0);
        expect(startAt).toBeGreaterThanOrEqual(0);
        expect(pauseAt).toBeLessThan(startAt);
    });
});

describe("save and load", () => {
    async function savedMidCall() {
        const { log, main, sub } = callStory();
        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await driveUntil(h, "B1");
        return { h, log, main, sub, saved: h.liveGame.serialize() };
    }

    /** Load a save into a fresh run of the same story, and let the render the player would do land. */
    async function loadInto(h: Harness, saved: SavedGame) {
        h.liveGame.newGame();
        h.liveGame.deserialize(JSON.parse(JSON.stringify(saved)) as SavedGame);
        h.state.events.emit(GameState.EventTypes["event:state.onRender"]);
        await tick();
        await tick();
    }

    it("records the suspended caller in the save", async () => {
        const { saved, main, sub } = await savedMidCall();
        const scenes = saved.game.stage.scenes;

        expect(scenes.map(s => s.sceneId).sort()).toEqual([main.getId(), sub.getId()].sort());
        expect(scenes.find(s => s.sceneId === main.getId())?.suspended).toBe(true);
        expect(scenes.find(s => s.sceneId === sub.getId())?.suspended).toBeUndefined();
    });

    it("names the return address by action id, never by position", async () => {
        const { saved, main } = await savedMidCall();
        const resume = linearActions(main).find(a => a.type === SceneActionTypes.resume);

        expect(resume).toBeDefined();
        // Ren'Py's `from` clauses exist because a return address stored by name moves when the file
        // around it is edited. An action id does not, and this is the assertion that keeps it one.
        const returnAddresses = saved.game.stackModel.items.filter(item => item.action === resume!.getId());
        expect(returnAddresses).toHaveLength(1);
    });

    it("comes back mid-call and still returns to the caller", async () => {
        const { saved, log } = await savedMidCall();

        const { log: log2, main: main2, sub: sub2 } = callStory();
        const h2 = harness(log2, main2, [main2, sub2]);
        await loadInto(h2, saved);

        expect(h2.state.isSceneSuspended(main2)).toBe(true);
        expect(h2.state.getLastScene()).toBe(sub2);

        await drive(h2);
        expect(log2[log2.length - 1]).toBe("A2");
        expect(h2.state.isSceneActive(sub2)).toBe(false);
        expect(h2.state.isSceneSuspended(main2)).toBe(false);
        // The run the save came from was left where it was.
        expect(log).toEqual(["A1", "B1"]);
    });

    it("refuses to start a suspended scene's music however the request arrives", async () => {
        // The load path skips the request, but a request armed BEFORE the load is fired again by the
        // stage remount a load performs - so the refusal has to live where the music starts, not
        // only where the load asks for it.
        const theme = Sound.bgm({ src: "/theme.mp3" });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([mark(log, "B1")] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub, { returnable: true })] as never);

        const h = harness(log, main, [main, sub]);
        recordAudio(h);
        h.liveGame.newGame();
        await driveUntil(h, "B1");
        expect(h.state.isSceneSuspended(main)).toBe(true);

        const before = h.audio.length;
        await SceneAction.initBackgroundMusic(
            main,
            h.state.getExposedStateForce<ExposedStateType.scene>(main),
            h.state,
        );
        expect(h.audio.slice(before)).toEqual([]);
    });

    it("does not restart a suspended scene's music on load", async () => {
        const { saved } = await savedMidCall();

        const theme = Sound.bgm({ src: "/theme.mp3" });
        const log2: string[] = [];
        const sub2 = new Scene("sub");
        const main2 = new Scene("main", { backgroundMusic: theme });
        sub2.action([mark(log2, "B1")] as never);
        main2.action([mark(log2, "A1"), main2.jumpTo(sub2, { returnable: true }), mark(log2, "A2")] as never);

        const h2 = harness(log2, main2, [main2, sub2]);
        await loadInto(h2, saved);

        // Nothing asked the parked scene's state to start playing again.
        expect(h2.audio.filter(entry => entry.startsWith("play:main:"))).toEqual([]);
    });

    it("reads a save written before scene calls existed as nothing suspended", async () => {
        const { saved } = await savedMidCall();
        const legacy = JSON.parse(JSON.stringify(saved)) as SavedGame;
        legacy.game.stage.scenes.forEach(scene => {
            delete (scene as { suspended?: boolean }).suspended;
        });

        const { log: log2, main: main2, sub: sub2 } = callStory();
        const h2 = harness(log2, main2, [main2, sub2]);
        await loadInto(h2, legacy);

        expect(h2.state.getSuspendedScenes()).toEqual([]);
        expect(h2.state.isSceneSuspended(main2)).toBe(false);
    });
});

describe("stepping back across the call boundary", () => {
    /** The action-history id of the first entry pushed for `type`. */
    function entryFor(h: Harness, type: string): string {
        const entry = h.state.actionHistory.getHistory().find(item => item.action.type === type);
        if (!entry) {
            throw new Error(`no action history entry for ${type}`);
        }
        return entry.id;
    }

    it("undoing the call brings the caller back and takes the called scene away", async () => {
        const { log, main, sub } = callStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");
        expect(h.state.isSceneSuspended(main)).toBe(true);

        h.state.actionHistory.undoUntil(entryFor(h, SceneActionTypes.callTo));

        expect(h.state.isSceneSuspended(main)).toBe(false);
        expect(h.state.getLastScene()).toBe(main);
        void sub;
    });

    it("undoing the return puts the called scene back and parks the caller again", async () => {
        const { log, main, sub } = callStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await drive(h);
        expect(log).toEqual(["A1", "B1", "A2"]);
        expect(h.state.isSceneActive(sub)).toBe(false);

        h.state.actionHistory.undoUntil(entryFor(h, SceneActionTypes.resume));
        await tick();

        expect(h.state.isSceneActive(sub)).toBe(true);
        expect(h.state.isSceneSuspended(main)).toBe(true);
        expect(h.state.getLastScene()).toBe(sub);
    });

    it("carries the whole call stack in the snapshot undo falls back on", async () => {
        const { log, main, sub } = callStory();
        const h = harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");

        // The unit `undo` restores when the in-place stack can no longer reach a line, and the same
        // unit a save is built from - so if it carries the call, both do.
        const snapshot = h.liveGame.captureGameState();
        expect(snapshot).not.toBeNull();
        expect(snapshot!.stage.scenes.find(s => s.sceneId === main.getId())?.suspended).toBe(true);
        expect(snapshot!.stage.scenes.some(s => s.sceneId === sub.getId())).toBe(true);
    });
});

describe("a jump taken while a call is open", () => {
    it("gives up the call stack and unloads every parked scene", async () => {
        const log: string[] = [];
        const away = new Scene("away");
        const sub = new Scene("sub");
        const main = new Scene("main");
        away.action([mark(log, "C1")] as never);
        sub.action([mark(log, "B1"), sub.jumpTo(away)] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub, { returnable: true }), mark(log, "A2")] as never);

        const h = harness(log, main, [main, sub, away]);
        h.liveGame.newGame();
        await drive(h);

        // "A2" is never reached: a plain jump is one-way, and it takes the frame that would have
        // returned to `main` with it.
        expect(log).toEqual(["A1", "B1", "C1"]);
        expect(h.state.getSuspendedScenes()).toEqual([]);
        expect(h.state.isSceneActive(main)).toBe(false);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.isSceneActive(away)).toBe(true);
    });

    it("keeps the return address when the play head moves inside the called scene", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([
            mark(log, "B1"),
            Control.jump("tail"),
            mark(log, "skipped"),
            Control.label("tail"),
            mark(log, "B2"),
        ] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub, { returnable: true }), mark(log, "A2")] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        // A `/goto` is a move within the scene, so the call still returns.
        expect(log).toEqual(["A1", "B1", "B2", "A2"]);
        expect(h.state.isSceneActive(sub)).toBe(false);
        expect(h.state.isSceneSuspended(main)).toBe(false);
    });
});

describe("the stack helper the play head moves against", () => {
    function bareStack(): StackModel {
        const liveGame = {
            game: { config: { maxStackModelLoop: 100, app: { debug: false } } },
            getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
        } as unknown as LiveGame;
        return new StackModel(liveGame, "$root");
    }

    it("clears to the innermost return address and leaves it standing", () => {
        const { main } = callStory();
        new Story("t").entry(main).constructStory();
        const resume = linearActions(main).find(a => a.type === SceneActionTypes.resume)!;

        const stack = bareStack();
        stack.push({ type: SceneActionTypes.callTo, node: resume.contentNode } as never);
        stack.push({ type: "script:action", node: null } as never);
        stack.push({ type: "script:action", node: null } as never);

        stack.clearAboveCallFrame();

        expect(stack.isEmpty()).toBe(false);
        expect(stack.getTopSync()?.node).toBe(resume.contentNode);
    });

    it("clears the whole stack when no call is open", () => {
        const stack = bareStack();
        stack.push({ type: "script:action", node: null } as never);

        stack.clearAboveCallFrame();

        expect(stack.isEmpty()).toBe(true);
    });

    it("looks for the action type the scene chain actually emits", () => {
        // The helper matches a literal rather than importing the action-type table, to keep the
        // stack model out of a cycle with the action layer. This is the pin that keeps the two
        // spellings the same.
        const { main } = callStory();
        new Story("t").entry(main).constructStory();
        const resume = linearActions(main).find(a => a.type === SceneActionTypes.resume)!;

        const stack = bareStack();
        stack.push({ type: SceneActionTypes.callTo, node: resume.contentNode } as never);
        stack.push({ type: "script:action", node: null } as never);
        stack.clearAboveCallFrame();

        expect(stack.isEmpty()).toBe(false);
        expect(SceneActionTypes.resume).toBe("scene:resume");
    });
});
