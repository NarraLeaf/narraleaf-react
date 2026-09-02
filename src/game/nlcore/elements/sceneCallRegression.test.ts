import { describe, expect, it, vi } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Control, Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { ControlActionTypes, SceneActionTypes } from "@core/action/actionTypes";
import { StackModel } from "@core/action/stackModel";
import { Awaitable } from "@lib/util/data";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { ControlAction } from "@core/action/actions/controlAction";
import { SceneAction } from "@core/action/actions/sceneAction";
import { StageTransitionManager } from "@player/elements/scene/stageTransition";
import { AudioManager } from "@player/lib/AudioManager";
import { ExposedStateType } from "@player/type";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * What scene calls changed for a story that never makes one.
 *
 * `sceneCallReturn.test.ts` covers the feature; this file covers its blast radius. Every case here
 * is a behaviour that shipped before `returnable` existed and passes through code the call/return
 * commits rewrote - the play head clearing the stack, the scene the story is "in", the shape of a
 * save, how a paused clip comes back from one. Each is written so that it fails if that older
 * behaviour moves, whether or not anything about calls is involved.
 *
 * The harness is the one from `sceneCallReturn.test.ts`: a real Game/GameState/LiveGame with the
 * React tree stood in for by hand, because what these assertions are about is the state those three
 * hold between them.
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

/** Minimal LiveGame stand-in for a StackModel that never executes a real action. */
function fakeLiveGame(): LiveGame {
    return {
        game: { config: { maxStackModelLoop: 100, app: { debug: false } } },
        getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
    } as unknown as LiveGame;
}

/**
 * A gameState/liveGame stand-in wrapping a real root StackModel, exposing exactly what the
 * `control:jump` handler reaches for - and nothing else, so a handler that went back to reaching
 * for something it no longer should fails here rather than passing quietly.
 */
function fakeGameState(mainStack: StackModel) {
    const liveGame = {
        getStackModelForce: () => mainStack,
        constructMaps: () => [new Map(), new Map()],
    };
    const gameState = {
        getLiveGame: () => liveGame,
        getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
        actionHistory: {
            push: () => ({ id: "h-0" }),
        },
    };
    return gameState as unknown as GameState;
}

/** How many items the stack is holding, counted the way a save counts them. */
const stackSize = (stack: StackModel): number => stack.serialize(false).items.length;

/** A one-scene story with a backward `Control.jump`, and the two actions it is built from. */
function labelJumpScene() {
    const scene = new Scene("s1");
    scene.action([
        Control.label("top"),
        Script.execute(() => void 0),
        Control.jump("top"),
    ] as never);
    new Story("t").entry(scene).constructStory();

    const actions = linearActions(scene);
    return {
        scene,
        label: actions.find(a => a.type === ControlActionTypes.label) as ControlAction,
        jump: actions.find(a => a.type === ControlActionTypes.jump) as ControlAction,
    };
}

describe("moving the play head with no call open", () => {
    /**
     * `clearAboveCallFrame` replaced `StackModel.reset` on the in-scene jump path. With no return
     * address anywhere on the stack the two have to be the same thing, down to aborting the
     * awaitables `reset` aborts - an abandoned awaitable is a timeline that keeps running against a
     * play head that has moved on.
     */
    it("clears the whole stack, aborting what it drops, when there is no return address", () => {
        const stack = new StackModel(fakeLiveGame(), "$root");
        const pending = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
        const abort = vi.spyOn(pending, "abort");

        stack.push({ type: "character:say", node: null } as unknown as CalledActionResult);
        stack.push({ type: "character:say", node: null } as unknown as CalledActionResult);
        stack.push(pending);

        stack.clearAboveCallFrame();

        expect(stack.isEmpty()).toBe(true);
        expect(stackSize(stack)).toBe(0);
        expect(abort).toHaveBeenCalled();
    });

    /**
     * The assertion `controlJump.test.ts` stops short of: it checks what ends up on top, which a
     * jump that cleared nothing would also satisfy. What a `/goto` has always done is leave the
     * target and *nothing under it*.
     */
    it("leaves nothing underneath the target of an in-scene jump", () => {
        const { label, jump } = labelJumpScene();
        const stack = new StackModel(fakeLiveGame(), "$root");

        // Pending work the jump is expected to wipe, exactly as it did before call frames existed.
        stack.push({ type: "character:say", node: null } as unknown as CalledActionResult);
        stack.push({ type: "character:say", node: null } as unknown as CalledActionResult);

        jump.executeAction(fakeGameState(stack), { stackModel: stack });

        expect(stack.getTopSync()?.node).toBe(label.contentNode);
        expect(stackSize(stack)).toBe(1);
    });

    /**
     * The return address is recognised by a string literal written out in `stackModel.ts` rather
     * than imported from the action-type table, so nothing but a test holds the two together: rename
     * `SceneActionTypes.resume` and the literal stays behind, `clearAboveCallFrame` stops finding
     * any frame, and every in-scene jump inside a called scene silently strands the scene that
     * called it. This is that test - it names the type through the table, never as a string.
     */
    it("recognises a return address by the type the action table declares for it", () => {
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([Script.execute(() => void 0)] as never);
        main.action([main.jumpTo(sub, { returnable: true })] as never);
        new Story("t").entry(main).constructStory();

        const resume = linearActions(main).find(action => action.type === SceneActionTypes.resume);
        expect(resume).toBeDefined();

        const stack = new StackModel(fakeLiveGame(), "$root");
        stack.push({ type: SceneActionTypes.resume, node: resume!.contentNode } as CalledActionResult);
        stack.push({ type: "character:say", node: null } as unknown as CalledActionResult);

        stack.clearAboveCallFrame();

        expect(stackSize(stack)).toBe(1);
        expect(stack.getTopSync()?.node).toBe(resume!.contentNode);
    });
});

describe("the scene the story is in, with nothing suspended", () => {
    /**
     * `getLastScene` walks the stage list backwards now instead of indexing its end. `addScene`
     * *unshifts*, so the end of that list is the scene added first - which is what the walk has to
     * land on when nothing is suspended, or a jump mid-transition (two scenes mounted, neither
     * parked) would answer with the wrong one.
     */
    it("is the last entry of the stage list, which is the scene added first", () => {
        const first = new Scene("first");
        const second = new Scene("second");
        const h = harness([], first, [first, second]);

        h.state.addScene(first);
        h.state.addScene(second);

        const elements = h.state.getSceneElements();
        expect(elements[elements.length - 1].scene).toBe(first);
        expect(h.state.getLastScene()).toBe(first);
    });

    it("is null while no scene is on the stage", () => {
        const only = new Scene("only");
        const h = harness([], only, [only]);

        expect(h.state.getLastScene()).toBeNull();
    });

    it("is the target scene once a plain jump has finished", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub)] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(h.state.getLastScene()).toBe(sub);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });
});

describe("a plain jump still gives its scene up and takes it back", () => {
    /**
     * `scene:jumpTo` gained an unwind of the call stack, and its undo entry gained a second argument
     * carrying what the unwind took. With no call open both are empty - and stepping back over the
     * jump has to still put the calling scene back on the stage, unparked.
     *
     * Wound back to `scene:exit`, which is the action that took the scene away: it runs before
     * `scene:jumpTo`, so undoing to it also undoes the jump on the way past.
     */
    it("undoes back across the jump with an empty call stack", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub)] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);
        expect(h.state.isSceneActive(main)).toBe(false);

        const entry = h.state.actionHistory.getHistory()
            .find(item => item.action.type === SceneActionTypes.exit);
        expect(entry).toBeDefined();
        h.state.actionHistory.undoUntil(entry!.id);
        await tick();

        expect(h.state.isSceneActive(main)).toBe(true);
        expect(h.state.isSceneSuspended(main)).toBe(false);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });
});

describe("the save a story with no calls writes", () => {
    /**
     * `suspended` is written conditionally so that a story that never calls produces the same stage
     * record it produced before the flag existed - which is what lets an engine that predates it
     * read one of these saves unchanged.
     */
    it("names no scene as suspended, and writes no key saying so", async () => {
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub)] as never);

        const h = harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        const scenes = h.liveGame.serialize().game.stage.scenes;
        expect(scenes.length).toBeGreaterThan(0);
        scenes.forEach(scene => {
            expect(Object.prototype.hasOwnProperty.call(scene, "suspended")).toBe(false);
        });
    });

    /**
     * Loading is where a scene's music is asked to start, and that request is now skipped for a
     * suspended scene. A save with nothing suspended has to still make it.
     */
    it("starts the scene's music again when it is loaded back", async () => {
        const theme = Sound.bgm({ src: "/theme.mp3" });
        const log: string[] = [];
        const main = new Scene("main", { backgroundMusic: theme });
        main.action([mark(log, "A1")] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drive(h);
        const saved = h.liveGame.serialize();

        const log2: string[] = [];
        const theme2 = Sound.bgm({ src: "/theme.mp3" });
        const main2 = new Scene("main", { backgroundMusic: theme2 });
        main2.action([mark(log2, "A1")] as never);
        const h2 = harness(log2, main2, [main2]);

        h2.liveGame.newGame();
        h2.liveGame.deserialize(JSON.parse(JSON.stringify(saved)));
        h2.state.events.emit(GameState.EventTypes["event:state.onRender"]);
        await tick();
        await tick();

        expect(h2.state.getSuspendedScenes()).toEqual([]);
        expect(h2.audio.filter(entry => entry.startsWith("play:main:"))).not.toEqual([]);
    });

    /**
     * The refusal added to `initBackgroundMusic` reads the game state, and a call that does not
     * hand it one - or hands it one where this scene is not parked - has to go through.
     */
    it("still starts a scene's music when the scene is not suspended", async () => {
        const theme = Sound.bgm({ src: "/theme.mp3" });
        const log: string[] = [];
        const main = new Scene("main", { backgroundMusic: theme });
        main.action([mark(log, "A1")] as never);

        const h = harness(log, main, [main]);
        h.liveGame.newGame();
        await drive(h);

        const before = h.audio.length;
        await SceneAction.initBackgroundMusic(
            main,
            h.state.getExposedStateForce<ExposedStateType.scene>(main),
            h.state,
        );
        expect(h.audio.slice(before).length).toBeGreaterThan(0);
    });
});

describe("preloading a story whose jumps are all plain", () => {
    /**
     * The jump branch of `registerSrc` was rewritten so that a call can fall through to what
     * follows it. A jump still has to do both halves of what it did: register the target's
     * background against this scene, and hand the target's own source manager over as a future - the
     * second is what makes everything the target reaches preloadable from here.
     *
     * Walked over a cycle, because a pair of scenes that jump to each other is where the seen-set
     * the rewrite reshuffled is the only thing between the walk and itself.
     */
    it("registers a plain jump's target as both a background and a future, on a cycle", () => {
        const a = new Scene("a", { background: "https://example.com/a.png" });
        const b = new Scene("b", { background: "https://example.com/b.png" });
        a.action([a.jumpTo(b)] as never);
        b.action([b.jumpTo(a)] as never);

        const story = new Story("t").entry(a);
        story.constructStory();

        const registered = a.srcManager.getSrc().map(src => String(src.src));
        expect(registered.some(src => src.includes("a.png"))).toBe(true);
        expect(registered.some(src => src.includes("b.png"))).toBe(true);
        expect(a.srcManager.hasFuture(b.srcManager)).toBe(true);
    });
});

describe("a scene root that is not parked", () => {
    /**
     * `registerScene` gained a write to the root's inline style. It has to stay off every scene
     * that is not suspended: a bare root is already posed the way a live scene is posed, and a
     * transition settles the same property, so an unasked-for write here would fight it.
     */
    function fakeStageState(suspended: boolean) {
        return { isSceneSuspended: () => suspended } as unknown as GameState;
    }

    it("is left exactly as it mounted", () => {
        const scene = new Scene("s");
        const element = { style: {} } as unknown as HTMLElement;

        new StageTransitionManager(fakeStageState(false)).registerScene(scene, element);

        expect(Object.keys(element.style)).toEqual([]);
    });

    it("is posed away only when the state says the scene is suspended", () => {
        const scene = new Scene("s");
        const element = { style: {} } as unknown as HTMLElement;

        new StageTransitionManager(fakeStageState(true)).registerScene(scene, element);

        expect(Object.keys(element.style).length).toBeGreaterThan(0);
    });
});

describe("a paused clip across the save boundary", () => {
    /** An audio manager with the backend replaced by a recorder, and no audio context in sight. */
    function stubbedManager() {
        const token = {
            pause: vi.fn(),
            stop: vi.fn(),
            resume: vi.fn(),
            mute: vi.fn(),
            seek: vi.fn(),
            isPlaying: () => false,
            getCurrentTime: () => 0,
            getVolume: () => 1,
            setVolume: vi.fn(),
        };
        const manager = new AudioManager({
            // `config` because deciding whether a clip is decoded or streamed reads
            // `audioStreaming`; nothing else here touches the game.
            game: { config: { audioStreaming: "loops" } },
            logger: { error: vi.fn(), weakWarn: vi.fn(), debug: vi.fn() },
        } as unknown as GameState);
        manager.getBuses = () => [];
        const internals = manager as unknown as {
            state: Map<unknown, unknown>;
            channelFor: () => unknown;
        };
        internals.channelFor = () => ({ play: async () => token });
        return { manager, token, internals };
    }

    async function settle(): Promise<void> {
        for (let i = 0; i < 8; i++) {
            await Promise.resolve();
        }
    }

    /**
     * The record a save carries per clip grew a `paused` key. It is written only for a clip that is
     * paused, so an unpaused one produces the record it produced before - which is what an engine
     * that predates the key reads.
     */
    it("writes the record it always wrote for a clip that is not paused", () => {
        const { manager, token, internals } = stubbedManager();
        const clip = Sound.bgm({ src: "/theme.mp3" });

        internals.state.set(clip, { token, originalVolume: 1 });

        const [, record] = manager.toData().sounds[0];
        expect(Object.keys(record).sort()).toEqual(["isPlaying", "position"]);
    });

    /**
     * The pre-0.39 way a paused clip came back: the record said nothing, and the sound's own
     * restored state said it was paused. Saves written that way are still out there, and the new
     * `data.paused ?? sound.state.paused` has to keep reading them the old way round.
     */
    it("comes back paused from a save that only says so on the element", async () => {
        const { manager, token } = stubbedManager();
        const clip = Sound.bgm({ src: "/theme.mp3" });
        clip.state.paused = true;

        manager.soundFromData(clip, { isPlaying: false, position: 12 });
        await settle();

        expect(token.pause).toHaveBeenCalled();
        expect(token.stop).not.toHaveBeenCalled();
        expect(clip.state.paused).toBe(true);
    });

    /** And a clip neither the record nor the element calls paused is still stopped, not paused. */
    it("stops a clip that neither the record nor the element calls paused", async () => {
        const { manager, token } = stubbedManager();
        const clip = Sound.bgm({ src: "/theme.mp3" });

        manager.soundFromData(clip, { isPlaying: false, position: 12 });
        await settle();

        expect(token.stop).toHaveBeenCalled();
        expect(token.pause).not.toHaveBeenCalled();
    });
});
