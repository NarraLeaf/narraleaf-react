import { beforeEach, describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import { setSceneBackgroundMusic } from "@player/elements/scene/backgroundMusic";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * A scene whose music was handed to it at runtime keeps it across a save and a load.
 *
 * `scene.state.backgroundMusic` is a pointer to a `Sound`, and a save can only carry a pointer as
 * an id. The saved record used to carry no id at all, so the load had nothing to resolve and fell
 * back to pouring the saved state into whatever `Sound` the scene already held - which is the one
 * its *config* named. A scene that declares no `backgroundMusic` holds `null` there when it is
 * freshly constructed, so the record was dropped and the pointer was lost: the clip came back and
 * kept playing, but the scene no longer knew it was its own.
 *
 * Nothing read that pointer after a load until scene calls arrived, which is why it went unnoticed.
 * `scene:resume` reads it - a caller parked behind a returnable jump resumes `state.backgroundMusic`
 * when the call returns - so a save taken inside a call came back to a caller that stayed silent for
 * the rest of the scene.
 *
 * The story here never declares its music in a scene config; that is the whole point. The audio is
 * driven through the **real** `AudioManager` over the **real** `@narraleaf/sound` backend, with only
 * Web Audio itself faked, so "the track is playing again" is the graph's own answer rather than a
 * recorded intention. The harness is `sceneCallReturn.test.ts`'s, with `sceneCallAudio.test.ts`'s
 * fake graph and real exposed `setBackgroundMusic` underneath it.
 */

/* ------------------------------------------------------------------------------------------- *
 * A Web Audio graph, faked at the lowest level the sound backend touches.
 * ------------------------------------------------------------------------------------------- */

/** The audio context's clock, in seconds. Nothing advances it but a test. */
const clock = { now: 0 };

/** Everything the graph was asked to do, in order: `start:<src>@<offset>` and `halt:<src>`. */
const timeline: string[] = [];

class FakeAudioParam {
    public value = 1;
    cancelScheduledValues(): this { return this; }
    setValueAtTime(value: number): this { this.value = value; return this; }
    linearRampToValueAtTime(value: number): this { this.value = value; return this; }
    setTargetAtTime(value: number): this { this.value = value; return this; }
}

class FakeGainNode {
    public readonly gain = new FakeAudioParam();
    connect(): void { }
    disconnect(): void { }
}

class FakeAudioBufferSourceNode {
    public buffer: { src?: string } | null = null;
    public loop = false;
    public loopStart = 0;
    public loopEnd = 0;
    public playbackRate = new FakeAudioParam();
    private readonly listeners = new Map<string, Set<() => void>>();

    connect(): void { }
    disconnect(): void { }
    start(_when = 0, offset = 0): void {
        timeline.push(`start:${this.buffer?.src ?? "?"}@${offset.toFixed(2)}`);
    }
    stop(): void {
        timeline.push(`halt:${this.buffer?.src ?? "?"}`);
    }
    addEventListener(name: string, callback: () => void): void {
        if (!this.listeners.has(name)) {
            this.listeners.set(name, new Set());
        }
        this.listeners.get(name)!.add(callback);
    }
    removeEventListener(name: string, callback: () => void): void {
        this.listeners.get(name)?.delete(callback);
    }
}

/**
 * The `<audio>` element a streamed clip plays through - scene background music, which loops the
 * whole file and is therefore streamed rather than decoded.
 *
 * Its play head is the element's own `currentTime` rather than an offset into a decoded buffer, so
 * the fake derives one from the same clock the context runs on: a playing track advances with the
 * clock, a paused one holds where it was, and a seek moves it. `start:<src>@<offset>` is written
 * here for the same reason the buffer source writes it - it is the graph being told to begin
 * playing at that position.
 */
class FakeHTMLAudioElement {
    public src: string;
    public loop = false;
    public crossOrigin: string | null = null;
    public playbackRate = 1;
    public preservesPitch = true;
    public paused = true;
    public duration = 600;
    /** The play head as of `since`; it only moves on its own while playing. */
    private head = 0;
    private since = 0;
    private readonly listeners = new Map<string, Set<() => void>>();

    constructor(src = "") {
        this.src = src;
    }

    get currentTime(): number {
        return this.paused ? this.head : this.head + (clock.now - this.since) * this.playbackRate;
    }
    set currentTime(time: number) {
        this.head = time;
        this.since = clock.now;
    }
    play(): Promise<void> {
        this.head = this.currentTime;
        this.since = clock.now;
        this.paused = false;
        timeline.push(`start:${this.src}@${this.head.toFixed(2)}`);
        return Promise.resolve();
    }
    pause(): void {
        this.head = this.currentTime;
        this.since = clock.now;
        this.paused = true;
    }
    /** Called by the backend after it blanks `src`, which is how a stopped element lets its media go. */
    load(): void {
        timeline.push(`halt:${this.src}`);
    }
    addEventListener(name: string, callback: () => void): void {
        if (!this.listeners.has(name)) {
            this.listeners.set(name, new Set());
        }
        this.listeners.get(name)!.add(callback);
    }
    removeEventListener(name: string, callback: () => void): void {
        this.listeners.get(name)?.delete(callback);
    }
}

class FakeAudioContext {
    public state = "running";
    public destination = new FakeGainNode();
    get currentTime(): number { return clock.now; }
    createGain(): FakeGainNode { return new FakeGainNode(); }
    createBufferSource(): FakeAudioBufferSourceNode { return new FakeAudioBufferSourceNode(); }
    createMediaElementSource(_element: FakeHTMLAudioElement): FakeGainNode { return new FakeGainNode(); }
    /** The "decoded" clip carries the path it came from, so the graph log can name it. */
    decodeAudioData(data: { src?: string }): Promise<unknown> {
        return Promise.resolve({ src: data?.src, duration: 600, sampleRate: 44100, numberOfChannels: 2 });
    }
    resume(): Promise<void> { this.state = "running"; return Promise.resolve(); }
    close(): Promise<void> { return Promise.resolve(); }
}

const globals = globalThis as unknown as Record<string, unknown>;
globals.AudioContext = FakeAudioContext;
// The backend tells its two kinds of source apart with `instanceof`, so these have to be the same
// classes the fake context and `new Audio(...)` hand out.
globals.AudioBufferSourceNode = FakeAudioBufferSourceNode;
globals.GainNode = FakeGainNode;
globals.HTMLAudioElement = FakeHTMLAudioElement;
globals.Audio = FakeHTMLAudioElement;
globals.fetch = (path: string) => Promise.resolve({
    ok: true,
    headers: { get: () => null },
    // Not a real ArrayBuffer: `decodeAudioData` above is the only thing that ever reads it, and it
    // reads the path so the graph log can say which clip a buffer source is playing.
    arrayBuffer: () => Promise.resolve({ src: path }),
} as unknown as Response);

/* ------------------------------------------------------------------------------------------- *
 * The harness.
 * ------------------------------------------------------------------------------------------- */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** What the scene bodies ran, in order. */
    log: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function harness(log: string[], entry: Scene, scenes: Scene[]): Promise<Harness> {
    const game = new Game({ app: { debug: false } });
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });
    // What the player component does on mount. Everything past this point is the shipped path.
    state.audioManager.initialize();
    await tick();

    const story = new Story("t").entry(entry);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    // Stand in for the React tree. Both halves of a scene entering the stage park on a mounted
    // component: `scene:init` waits for the scene's own exposed state, and every layer and image
    // the scene brings with it waits for its own. The `setBackgroundMusic` here is verbatim from
    // `Scene.tsx`'s `useExposeState` - the real cross-fade helper, which drives the real manager.
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
                await setSceneBackgroundMusic(state, element as unknown as Scene, music, fade);
            },
        } as never);
    });

    // Verbatim from `Scene.tsx`'s second effect. A scene stops its own track when it leaves the
    // stage, and that listener lives in the component - the action layer only emits the event.
    scenes.forEach(scene => {
        scene.events.on(Scene.EventTypes["event:scene.preUnmount"], () => {
            if (scene.state.backgroundMusic) {
                return state.audioManager.stop(scene.state.backgroundMusic, scene.config.backgroundMusicFade);
            }
        });
    });

    return { game, state, liveGame, log };
}

/** Wait for an awaitable the story parked on - loading and decoding a clip takes several turns. */
async function settle(result: unknown): Promise<void> {
    if (!Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
        return;
    }
    for (let i = 0; i < 40 && !result.isSettled(); i++) {
        await tick();
    }
    if (!result.isSettled()) {
        throw new Error("drive: parked on an awaitable that never settled");
    }
}

/** Roll the main stack the way the player component does, stopping when it empties. */
async function drive(h: Harness, steps: number = 400): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            await tick();
            return;
        }
        await settle(h.liveGame.next());
        await tick();
    }
    throw new Error("drive: ran out of steps");
}

/** Roll until `marker` has been logged, so a test can stop the story mid-scene. */
async function driveUntil(h: Harness, marker: string, steps: number = 400): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.log.includes(marker)) {
            await tick();
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveUntil: story ended before "${marker}" (log: ${h.log.join(",")})`);
        }
        await settle(h.liveGame.next());
        await tick();
    }
    throw new Error(`driveUntil: "${marker}" never ran (log: ${h.log.join(",")})`);
}

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

/** Move the audio clock from inside a scene body, so a track accumulates a play position. */
const advance = (to: number) => Script.execute(() => {
    clock.now = to;
});

/** The token the manager is holding for a clip. Throws rather than letting an assertion pass on null. */
function tokenOf(h: Harness, sound: Sound) {
    const token = h.state.audioManager.getToken(sound);
    if (!token) {
        throw new Error(`no token for ${sound.config.src}`);
    }
    return token;
}

/** Load a save into a fresh run of the same story, and let the render the player would do land. */
async function loadInto(h: Harness, saved: SavedGame): Promise<void> {
    h.liveGame.newGame();
    clock.now = 0;
    h.liveGame.deserialize(JSON.parse(JSON.stringify(saved)) as SavedGame);
    h.state.events.emit(GameState.EventTypes["event:state.onRender"]);
    for (let i = 0; i < 12; i++) {
        await tick();
    }
}

beforeEach(() => {
    clock.now = 0;
    timeline.length = 0;
});

/* ------------------------------------------------------------------------------------------- *
 * 1. An ordinary save and load, with no scene call anywhere.
 * ------------------------------------------------------------------------------------------- */

describe("a scene handed its music at runtime", () => {
    /** `main` declares no music and is given a track by an action. */
    function runtimeMusicStory() {
        const track = Sound.bgm({ src: "/track.mp3", loop: true });
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            main.setBackgroundMusic(track, 0),
            mark(log, "A2"),
            mark(log, "A3"),
        ] as never);
        return { log, main, track };
    }

    it("still points at that track after a save and a load", async () => {
        const first = runtimeMusicStory();
        const h1 = await harness(first.log, first.main, [first.main]);
        h1.liveGame.newGame();
        await driveUntil(h1, "A2");

        // The premise: the scene owns the track, and its config never mentioned it.
        expect(first.main.state.backgroundMusic).toBe(first.track);
        expect(h1.state.audioManager.isManaged(first.track)).toBe(true);
        const saved = JSON.parse(JSON.stringify(h1.liveGame.serialize())) as SavedGame;

        const second = runtimeMusicStory();
        const h2 = await harness(second.log, second.main, [second.main]);
        await loadInto(h2, saved);

        // The clip comes back either way - `AudioManager` restores it from its own record. What is
        // asserted here is the *pointer*: the scene has to know the track is its own.
        expect(h2.state.audioManager.isManaged(second.track)).toBe(true);
        expect(second.main.state.backgroundMusic).toBe(second.track);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 2. The same scene, saved while parked behind a returnable jump.
 * ------------------------------------------------------------------------------------------- */

describe("a runtime-set track on a scene suspended behind a call", () => {
    /** `main` is given a track, plays 12.5 seconds of it, calls `sub`, and comes back. */
    function callStory() {
        const track = Sound.bgm({ src: "/track.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main");
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            main.setBackgroundMusic(track, 0),
            advance(12.5),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);
        return { log, main, sub, track };
    }

    it("plays again when the call returns after a save and a load", async () => {
        const first = callStory();
        const h1 = await harness(first.log, first.main, [first.main, first.sub]);
        h1.liveGame.newGame();
        await driveUntil(h1, "B1");

        // The premise: parked, with its own track paused where it left off.
        expect(h1.state.isSceneSuspended(first.main)).toBe(true);
        expect(first.main.state.backgroundMusic).toBe(first.track);
        expect(tokenOf(h1, first.track).isPaused()).toBe(true);
        const saved = JSON.parse(JSON.stringify(h1.liveGame.serialize())) as SavedGame;

        const second = callStory();
        const h2 = await harness(second.log, second.main, [second.main, second.sub]);
        await loadInto(h2, saved);

        expect(h2.state.isSceneSuspended(second.main)).toBe(true);
        expect(second.main.state.backgroundMusic).toBe(second.track);
        expect(tokenOf(h2, second.track).isPaused()).toBe(true);

        // The return. `scene:resume` resumes the scene's own track, so it has to still be the
        // scene's own track - and it picks up where the save left it rather than starting over.
        timeline.length = 0;
        await drive(h2);
        expect(second.log[second.log.length - 1]).toBe("A2");
        expect(second.track.state.paused).toBe(false);
        expect(tokenOf(h2, second.track).isPlaying()).toBe(true);
        expect(h2.state.audioManager.getPosition(second.track)).toBeCloseTo(12.5, 5);
        expect(timeline.filter(entry => entry.startsWith("start:/track.mp3")))
            .toEqual(["start:/track.mp3@12.50"]);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 3. A save written before the record named the clip.
 * ------------------------------------------------------------------------------------------- */

describe("a save written before the record carried an id", () => {
    /** A scene that declares its music in its config - the only shape an old save could restore. */
    function declaredMusicStory() {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const main = new Scene("main", { backgroundMusic: theme });
        main.action([mark(log, "A1"), mark(log, "A2")] as never);
        return { log, main, theme };
    }

    it("is read from the scene's own instance, exactly as it always was", async () => {
        const first = declaredMusicStory();
        const h1 = await harness(first.log, first.main, [first.main]);
        h1.liveGame.newGame();
        await driveUntil(h1, "A1");
        h1.state.audioManager.mute(first.theme, true);

        const saved = JSON.parse(JSON.stringify(h1.liveGame.serialize())) as SavedGame;
        // Age the save: strip the id this release added, leaving the record as it used to be
        // written - the sound's state and nothing else.
        let stripped = 0;
        saved.game.elementStates.forEach(({ data }) => {
            const music = (data as { state?: { backgroundMusic?: { id?: string } } }).state?.backgroundMusic;
            if (music && "id" in music) {
                delete music.id;
                stripped++;
            }
        });
        expect(stripped).toBe(1);

        const second = declaredMusicStory();
        const h2 = await harness(second.log, second.main, [second.main]);
        await loadInto(h2, saved);

        expect(second.main.state.backgroundMusic).toBe(second.theme);
        expect(second.theme.state.muted).toBe(true);
    });
});
