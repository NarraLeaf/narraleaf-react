import { beforeEach, describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import { setSceneBackgroundMusic } from "@player/elements/scene/backgroundMusic";
import type { AudioDataRaw } from "@player/lib/AudioManager";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult, SavedGame } from "@core/gameTypes";

/**
 * What a scene call does to the audio that is actually playing.
 *
 * `sceneCallReturn.test.ts` asserts which transport call a call and a return make, and does it by
 * replacing `isManaged`/`pause`/`resume` on the audio manager - so nothing there can tell a track
 * that resumes from 12.5 seconds apart from one that starts over. This file runs the same stories
 * with the **real** `AudioManager` and the **real** `@narraleaf/sound` backend, and asserts the
 * state they end up in: whether a token is paused, where its play head is, what its own `pause`/
 * `resume` events say, and what offset the Web Audio graph was asked to start at.
 *
 * The only thing faked is Web Audio itself - a context, a gain node and a buffer source, none of
 * which node has. Every line of `AudioManager`, `SoundToken`, `Channel` and `Sound` runs for real
 * above them, including the play-head arithmetic that decides where a resumed clip picks up.
 *
 * Two stand-ins remain, both for the React tree the player would supply and both copied verbatim
 * from `Scene.tsx`: the scene's exposed `setBackgroundMusic` (which calls the real
 * `setSceneBackgroundMusic`), and the `event:scene.preUnmount` listener that stops a leaving
 * scene's track. The second one matters - see the last describe block.
 */

/* ------------------------------------------------------------------------------------------- *
 * A Web Audio graph, faked at the lowest level the sound backend touches.
 * ------------------------------------------------------------------------------------------- */

/** The audio context's clock, in seconds. Nothing advances it but a test. */
const clock = { now: 0 };

/**
 * Everything the graph was asked to do, in order.
 *
 * `start:<src>@<offset>` and `halt:<src>` are written by the buffer source itself, so an entry
 * saying `@12.50` is the graph genuinely being told to begin playback 12.5 seconds into the file.
 * `pause:`/`resume:`/`stop:` are the token's own events, attached by the harness to every scene
 * track the moment it starts.
 */
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
    /**
     * Mount every element's exposed state, the way a render of the player's tree does.
     *
     * Called for you unless the harness was built with `{mount: false}`. Mounting late is how a
     * test gets a scene-init request to be *waiting* rather than already served, which is the
     * position a load finds one in.
     */
    mount: () => void;
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/** A game state with a real, initialized audio manager on top of the fake graph. */
async function readyState(game: Game): Promise<GameState> {
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });
    // What the player component does on mount. Everything past this point is the shipped path.
    state.audioManager.initialize();
    await tick();
    return state;
}

async function harness(
    log: string[],
    entry: Scene,
    scenes: Scene[],
    options: { mount?: boolean } = {},
): Promise<Harness> {
    const game = new Game({ app: { debug: false } });
    const state = await readyState(game);
    const story = new Story("t").entry(entry);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    // Put a scene track's own transport events onto the timeline from the moment it exists, so a
    // test can assert what happened to a clip *before* it stopped to look at it.
    const watched = new WeakSet<object>();
    const watch = (music: Sound | null) => {
        if (!music) {
            return;
        }
        const token = state.audioManager.getToken(music);
        if (!token || watched.has(token)) {
            return;
        }
        watched.add(token);
        (["pause", "resume", "stop"] as const).forEach(event => {
            token.on(event, () => {
                timeline.push(`${event}:${music.config.src}`);
            });
        });
    };

    const [, elements] = (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
    const mount = () => {
        elements.forEach(element => {
            if (state.isStateMounted(element as never)) {
                return;
            }
            state.mountState(element as never, {
                initDisplayable: (onMounted: VoidFunction) => onMounted(),
                // Verbatim from `Scene.tsx`'s `useExposeState`: the real cross-fade helper, which
                // is what drives `AudioManager.stop` and `AudioManager.playSoundToken`.
                setBackgroundMusic: async (music: Sound | null, fade: number) => {
                    await setSceneBackgroundMusic(state, element as unknown as Scene, music, fade);
                    watch(music);
                },
            } as never);
        });
    };
    if (options.mount !== false) {
        mount();
    }

    // Verbatim from `Scene.tsx`'s second effect. A scene stops its own track when it leaves the
    // stage, and that listener lives in the component - the action layer only emits the event.
    scenes.forEach(scene => {
        scene.events.on(Scene.EventTypes["event:scene.preUnmount"], () => {
            if (scene.state.backgroundMusic) {
                return state.audioManager.stop(scene.state.backgroundMusic, scene.config.backgroundMusicFade);
            }
        });
    });

    return { game, state, liveGame, log, mount };
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

/** Roll until `marker` has been logged, so a test can stop the story mid-call. */
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

/** Run something against the live game state from inside a scene body. */
const run = (fn: (state: GameState) => void) => Script.execute(({ gameState }: { gameState: GameState }) => {
    fn(gameState);
});

/** The token the manager is holding for a clip. Throws rather than letting an assertion pass on null. */
function tokenOf(h: Harness, sound: Sound) {
    const token = h.state.audioManager.getToken(sound);
    if (!token) {
        throw new Error(`no token for ${sound.config.src}`);
    }
    return token;
}

/**
 * The backend channel a bus is realized as.
 *
 * Reached through the manager's own map because nothing exposes it: `getBuses()` reports the
 * mixer's bookkeeping, and the point of a bus test is that the bookkeeping and the gain node agree.
 */
function busChannel(state: GameState, id: string): { getVolume(): number; getGainNode(): { gain: { value: number } } } {
    const channels = (state.audioManager as unknown as {
        channels: Map<string, { getVolume(): number; getGainNode(): { gain: { value: number } } }>;
    }).channels;
    const channel = channels.get(id);
    if (!channel) {
        throw new Error(`no backend channel for bus "${id}"`);
    }
    return channel;
}

beforeEach(() => {
    clock.now = 0;
    timeline.length = 0;
});

/* ------------------------------------------------------------------------------------------- *
 * 1. The caller's track is paused, and comes back where it left off.
 * ------------------------------------------------------------------------------------------- */

describe("the caller's own track", () => {
    /** `main` plays a theme, runs 12.5 seconds of it, calls `sub`, and comes back. */
    function musicStory() {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            advance(12.5),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);
        return { log, main, sub, theme };
    }

    it("pauses it for real and holds the play head where it was", async () => {
        const { log, main, sub, theme } = musicStory();
        const h = await harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");

        const token = tokenOf(h, theme);
        expect(theme.state.paused).toBe(true);
        expect(token.isPaused()).toBe(true);
        expect(token.isPlaying()).toBe(false);
        expect(h.state.audioManager.getPosition(theme)).toBeCloseTo(12.5, 5);

        // The clock runs on while the callee plays; a paused play head does not.
        clock.now = 300;
        expect(h.state.audioManager.getPosition(theme)).toBeCloseTo(12.5, 5);
    });

    it("resumes from that position rather than restarting", async () => {
        const { log, main, sub, theme } = musicStory();
        const h = await harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");
        const parked = tokenOf(h, theme);
        clock.now = 300;

        await drive(h);
        expect(log).toEqual(["A1", "B1", "A2"]);

        // The same token, not a fresh one - a restart would have built a new one.
        expect(h.state.audioManager.getToken(theme)).toBe(parked);
        expect(theme.state.paused).toBe(false);
        expect(parked.isPlaying()).toBe(true);
        expect(h.state.audioManager.getPosition(theme)).toBeCloseTo(12.5, 5);

        // ...and it is genuinely running again from there, not frozen at 12.5.
        clock.now = 310;
        expect(h.state.audioManager.getPosition(theme)).toBeCloseTo(22.5, 5);

        // What the graph was told, from the bottom of the stack: begin at 0, then begin at 12.5.
        expect(timeline.filter(entry => entry.startsWith("start:/theme.mp3")))
            .toEqual(["start:/theme.mp3@0.00", "start:/theme.mp3@12.50"]);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 2. The callee brings its own track.
 * ------------------------------------------------------------------------------------------- */

describe("a callee with music of its own", () => {
    function twoTrackStory() {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const other = Sound.bgm({ src: "/other.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub", { backgroundMusic: other });
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            advance(8),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);
        return { log, main, sub, theme, other };
    }

    it("starts the callee's track after the caller's is paused, and leaves the caller's paused", async () => {
        const { log, main, sub, theme, other } = twoTrackStory();
        const h = await harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");

        expect(theme.state.paused).toBe(true);
        expect(tokenOf(h, theme).isPaused()).toBe(true);
        expect(other.state.paused).toBe(false);
        expect(tokenOf(h, other).isPlaying()).toBe(true);

        // The caller's clip is off the graph before the callee's is on it, so the two never overlap.
        const pausedAt = timeline.indexOf("pause:/theme.mp3");
        const startedAt = timeline.indexOf("start:/other.mp3@0.00");
        expect(pausedAt).toBeGreaterThanOrEqual(0);
        expect(startedAt).toBeGreaterThanOrEqual(0);
        expect(pausedAt).toBeLessThan(startedAt);
    });

    it("stops the callee's track on the way out and resumes the caller's", async () => {
        const { log, main, sub, theme, other } = twoTrackStory();
        const h = await harness(log, main, [main, sub]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");
        const otherToken = tokenOf(h, other);

        await drive(h);
        expect(log).toEqual(["A1", "B1", "A2"]);

        // The callee's track is stopped, not merely paused: it is not coming back.
        expect(h.state.audioManager.isManaged(other)).toBe(false);
        expect(otherToken.isPlaying()).toBe(false);
        expect(otherToken.isPaused()).toBe(false);

        expect(theme.state.paused).toBe(false);
        expect(tokenOf(h, theme).isPlaying()).toBe(true);
        expect(h.state.audioManager.getPosition(theme)).toBeCloseTo(8, 5);
        expect(timeline).toContain("resume:/theme.mp3");
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 2b. A call short enough to outrun the caller's fade.
 * ------------------------------------------------------------------------------------------- */

/**
 * A faded pause does not act until its fade has finished - and `FadeToken.finished` resolves when
 * the fade is **cancelled** as well as when it runs out, which is exactly what the resume on the
 * way back does to it. So a call that returns while the caller's pause fade is still in flight
 * lands the pause *after* the resume, and there is nothing left to undo it: the caller's music is
 * silent for the rest of the scene, and `sound.state.paused` says `false` while it is silent - so
 * a save written afterwards records a stopped clip rather than a paused one.
 *
 * A scene with a long `backgroundMusicFade` calling a short scene is an ordinary thing to write.
 */
describe("a call that returns before the caller's pause fade has finished", () => {
    it("does not pause a clip that has already been resumed", async () => {
        const game = new Game({ app: { debug: false } });
        const state = await readyState(game);
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });

        await state.audioManager.playSoundToken(theme);
        clock.now = 9;
        // What `scene:preSuspend` and `scene:resume` do, in the order a short callee produces.
        state.audioManager.pause(theme, 250);
        state.audioManager.resume(theme, 250);
        await new Promise(resolve => setTimeout(resolve, 400));

        const token = state.audioManager.getToken(theme)!;
        expect(token.isPaused()).toBe(false);
        expect(token.isPlaying()).toBe(true);
        // The element and the token have to agree: a save is written from one and the sound comes
        // out of the other.
        expect(theme.state.paused).toBe(false);
    });

    it("leaves the caller's track audible when a story takes that path", async () => {
        // The fade has to outlast the callee for this to exercise anything, and the harness rolls
        // the stack a good deal slower than a player does - hence a fade at the long end of what an
        // author would write. The elapsed-time assertion below is what stops this quietly passing
        // by being too slow rather than by being correct.
        const fade = 2000;
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme, backgroundMusicFade: fade });
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            advance(9),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = await harness(log, main, [main, sub]);
        h.liveGame.newGame();
        const startedAt = Date.now();
        await drive(h);
        const elapsed = Date.now() - startedAt;
        expect(log).toEqual(["A1", "B1", "A2"]);
        expect(elapsed).toBeLessThan(fade);

        // Both fades are real timers. Let them land.
        await new Promise(resolve => setTimeout(resolve, fade + 300));

        const token = tokenOf(h, theme);
        expect(token.isPaused()).toBe(false);
        expect(token.isPlaying()).toBe(true);
        expect(theme.state.paused).toBe(false);
        expect(h.state.audioManager.toData().sounds.find(([id]) => id === theme.getId())?.[1])
            .toMatchObject({ isPlaying: true });
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 3. A sound that belongs to the story, not to a scene.
 * ------------------------------------------------------------------------------------------- */

describe("a story-level sound", () => {
    it("plays on across the call and across the return", async () => {
        const rain = Sound.sound({ src: "/rain.mp3", loop: true });
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            rain.play(),
            advance(5),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = await harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await driveUntil(h, "B1");

        const rainToken = tokenOf(h, rain);

        // Only the scene's own track is suspended. Ambience is the story's, and a plain jump would
        // not have stopped it either.
        expect(theme.state.paused).toBe(true);
        expect(rain.state.paused).toBe(false);
        expect(rainToken.isPlaying()).toBe(true);
        expect(h.state.audioManager.isPlaying(rain)).toBe(true);
        clock.now = 40;
        expect(h.state.audioManager.getPosition(rain)).toBeCloseTo(40, 5);

        await drive(h);
        expect(log).toEqual(["A1", "B1", "A2"]);

        expect(h.state.audioManager.getToken(rain)).toBe(rainToken);
        expect(rainToken.isPlaying()).toBe(true);
        expect(rain.state.paused).toBe(false);
        expect(h.state.audioManager.isManaged(rain)).toBe(true);
        // Nothing touched it in either direction: one start at the top of the file, and the graph
        // was never told to halt that buffer - which is what a pause and a stop both come down to.
        expect(timeline.filter(entry => entry.includes("/rain.mp3")))
            .toEqual(["start:/rain.mp3@0.00"]);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 4. The save record, written and read by the real manager.
 * ------------------------------------------------------------------------------------------- */

describe("the audio save record", () => {
    async function bareManager() {
        const game = new Game({ app: { debug: false } });
        const state = await readyState(game);
        return state.audioManager;
    }

    it("round-trips both paused and position", async () => {
        const manager = await bareManager();
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });

        await manager.playSoundToken(theme);
        clock.now = 31.25;
        manager.pause(theme);

        const record = manager.toData().sounds.find(([id]) => id === theme.getId())?.[1];
        expect(record).toEqual({ isPlaying: false, position: 31.25, paused: true });

        // A fresh element, exactly as a fresh run of the story would hand the manager.
        const restored = Sound.bgm({ src: "/theme.mp3", loop: true });
        manager.soundFromData(restored, record as AudioDataRaw);
        for (let i = 0; i < 8; i++) {
            await tick();
        }

        expect(restored.state.paused).toBe(true);
        const token = manager.getToken(restored);
        expect(token).not.toBeNull();
        expect(token!.isPaused()).toBe(true);
        expect(token!.isPlaying()).toBe(false);
        expect(manager.getPosition(restored)).toBeCloseTo(31.25, 5);
        expect(timeline).toContain("start:/theme.mp3@31.25");
    });

    it("falls back to the element for a record written before `paused` existed", async () => {
        const manager = await bareManager();

        // A legacy record - no `paused` key at all - for a clip whose element says it was paused.
        const legacy = Sound.bgm({ src: "/theme.mp3", loop: true });
        legacy.state.paused = true;
        manager.soundFromData(legacy, { isPlaying: false, position: 9 });
        for (let i = 0; i < 8; i++) {
            await tick();
        }

        expect(legacy.state.paused).toBe(true);
        expect(manager.getToken(legacy)!.isPaused()).toBe(true);
        expect(manager.getPosition(legacy)).toBeCloseTo(9, 5);

        // ...and the same legacy record for an element that says nothing is a stopped clip, which
        // is what it always meant.
        const stopped = Sound.bgm({ src: "/other.mp3" });
        manager.soundFromData(stopped, { isPlaying: false, position: 9 });
        for (let i = 0; i < 8; i++) {
            await tick();
        }

        expect(stopped.state.paused).toBe(false);
        expect(manager.getToken(stopped)!.isPaused()).toBe(false);
        expect(manager.getToken(stopped)!.isPlaying()).toBe(false);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 5. A bus volume set inside the callee.
 * ------------------------------------------------------------------------------------------- */

describe("a bus volume changed inside the callee", () => {
    it("survives the return, on the mixer and on the gain node", async () => {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([
            mark(log, "B1"),
            run(state => state.audioManager.setBusVolume("bgm", 0.4)),
        ] as never);
        main.action([mark(log, "A1"), main.jumpTo(sub, { returnable: true }), mark(log, "A2")] as never);

        const h = await harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await drive(h);

        expect(log).toEqual(["A1", "B1", "A2"]);
        expect(h.state.audioManager.getBusVolume("bgm")).toBeCloseTo(0.4, 5);
        expect(h.state.audioManager.getBuses().find(bus => bus.id === "bgm"))
            .toMatchObject({ volume: 0.4, effectiveVolume: 0.4 });
        // The gain node the resumed track plays through, not just the bookkeeping.
        const channel = busChannel(h.state, "bgm");
        expect(channel.getVolume()).toBeCloseTo(0.4, 5);
        expect(channel.getGainNode().gain.value).toBeCloseTo(0.4, 5);
        // The caller's track is back on that bus.
        expect(tokenOf(h, theme).isPlaying()).toBe(true);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 6. Two calls deep.
 * ------------------------------------------------------------------------------------------- */

describe("a chain of calls", () => {
    it("parks both tracks and unwinds them innermost first", async () => {
        const outerTheme = Sound.bgm({ src: "/outer.mp3", loop: true });
        const middleTheme = Sound.bgm({ src: "/middle.mp3", loop: true });
        const log: string[] = [];
        const inner = new Scene("inner");
        const middle = new Scene("middle", { backgroundMusic: middleTheme });
        const outer = new Scene("outer", { backgroundMusic: outerTheme });
        inner.action([mark(log, "C1")] as never);
        middle.action([
            mark(log, "B1"),
            advance(20),
            middle.jumpTo(inner, { returnable: true }),
            mark(log, "B2"),
        ] as never);
        outer.action([
            mark(log, "A1"),
            advance(10),
            outer.jumpTo(middle, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = await harness(log, outer, [outer, middle, inner]);
        h.liveGame.newGame();
        await driveUntil(h, "C1");

        expect(h.state.getSuspendedScenes()).toEqual([middle, outer]);
        // `outer` ran 10 seconds before calling; `middle` started at 10 and ran to 20.
        expect(outerTheme.state.paused).toBe(true);
        expect(middleTheme.state.paused).toBe(true);
        expect(h.state.audioManager.getPosition(outerTheme)).toBeCloseTo(10, 5);
        expect(h.state.audioManager.getPosition(middleTheme)).toBeCloseTo(10, 5);

        const middleToken = tokenOf(h, middleTheme);
        clock.now = 500;

        await drive(h);
        expect(log).toEqual(["A1", "B1", "C1", "B2", "A2"]);

        // Both were parked, and the inner call returns first - so `middle` is heard again before
        // `outer` is, and each picks up where it was rather than at the top.
        expect(timeline.filter(entry => entry.startsWith("pause:")))
            .toEqual(["pause:/outer.mp3", "pause:/middle.mp3"]);
        expect(timeline.filter(entry => entry.startsWith("resume:")))
            .toEqual(["resume:/middle.mp3", "resume:/outer.mp3"]);
        expect(timeline.filter(entry => entry.startsWith("start:/outer.mp3")))
            .toEqual(["start:/outer.mp3@0.00", "start:/outer.mp3@10.00"]);
        expect(timeline.filter(entry => entry.startsWith("start:/middle.mp3")))
            .toEqual(["start:/middle.mp3@0.00", "start:/middle.mp3@10.00"]);

        // `outer` is the scene the story came back to, so its track is the one still running;
        // `middle` left the stage on the way out and its track went with it.
        expect(tokenOf(h, outerTheme).isPlaying()).toBe(true);
        expect(h.state.audioManager.getPosition(outerTheme)).toBeCloseTo(10, 5);
        expect(h.state.audioManager.isManaged(middleTheme)).toBe(false);
        expect(middleToken.isPlaying()).toBe(false);
        expect(middleToken.isPaused()).toBe(false);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 7. The whole chain: save inside a call, load, return.
 * ------------------------------------------------------------------------------------------- */

describe("a save taken inside a call", () => {
    function musicCallStory() {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            advance(17.5),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);
        return { log, main, sub, theme };
    }

    /** Run the story up to the middle of the call and take the save from there. */
    async function savedMidCall(): Promise<SavedGame> {
        const first = musicCallStory();
        const h1 = await harness(first.log, first.main, [first.main, first.sub]);
        h1.liveGame.newGame();
        await driveUntil(h1, "B1");
        expect(first.theme.state.paused).toBe(true);
        return JSON.parse(JSON.stringify(h1.liveGame.serialize())) as SavedGame;
    }

    it("comes back paused at the right position, and still resumes on return", async () => {
        const first = musicCallStory();
        const h1 = await harness(first.log, first.main, [first.main, first.sub]);
        h1.liveGame.newGame();
        await driveUntil(h1, "B1");
        expect(first.theme.state.paused).toBe(true);
        const saved = JSON.parse(JSON.stringify(h1.liveGame.serialize())) as SavedGame;

        // The save has to speak for the paused track on its own: the clip is a scene's background
        // music, so it is not any action's callee and need not be in the element table at all.
        const record = saved.game.stage.audio.sounds.find(([id]) => id === first.theme.getId())?.[1];
        expect(record).toMatchObject({ paused: true, position: 17.5, isPlaying: false });

        // A fresh run of the same story, loaded from that save.
        const second = musicCallStory();
        const h2 = await harness(second.log, second.main, [second.main, second.sub]);
        h2.liveGame.newGame();
        clock.now = 0;
        h2.liveGame.deserialize(saved);
        h2.state.events.emit(GameState.EventTypes["event:state.onRender"]);
        for (let i = 0; i < 10; i++) {
            await tick();
        }

        expect(h2.state.isSceneSuspended(second.main)).toBe(true);
        expect(second.theme.state.paused).toBe(true);
        expect(h2.state.audioManager.isManaged(second.theme)).toBe(true);
        const token = tokenOf(h2, second.theme);
        expect(token.isPaused()).toBe(true);
        expect(token.isPlaying()).toBe(false);
        expect(h2.state.audioManager.getPosition(second.theme)).toBeCloseTo(17.5, 5);

        // And the loaded run still returns, with the track picking up where the save left it.
        await drive(h2);
        expect(second.log[second.log.length - 1]).toBe("A2");
        expect(second.theme.state.paused).toBe(false);
        expect(tokenOf(h2, second.theme).isPlaying()).toBe(true);
        expect(h2.state.audioManager.getPosition(second.theme)).toBeCloseTo(17.5, 5);
    });

    /**
     * The other half of the same defect: the request that restarts a parked track is not always
     * the one the load made.
     *
     * Starting a scene's music parks on that scene's component being mounted. A request armed
     * while the component is not up yet is still waiting when a load arrives, and the stage
     * remount a load performs fires it - by which time the scene it names has been restored as
     * *suspended*. Skipping the request on the load path cannot catch that one; only the refusal
     * inside `initBackgroundMusic` can.
     */
    it("refuses a request that was armed before the load and replayed by the remount", async () => {
        const saved = await savedMidCall();

        // A player whose stage has not rendered yet: nothing is mounted, so the init that puts
        // `main` on stage arms its music request and leaves it waiting.
        const second = musicCallStory();
        const h2 = await harness(second.log, second.main, [second.main, second.sub], { mount: false });
        h2.liveGame.newGame();
        for (let i = 0; i < 6 && !h2.state.isSceneActive(second.main); i++) {
            h2.liveGame.next();
            await tick();
        }
        // `scene:init` has put `main` on stage and asked for its music; the request is parked on a
        // component that has not mounted, so nothing has started.
        expect(h2.state.isSceneActive(second.main)).toBe(true);
        expect(h2.state.isStateMounted(second.main as never)).toBe(false);
        expect(h2.state.audioManager.isManaged(second.theme)).toBe(false);

        clock.now = 0;
        timeline.length = 0;
        h2.liveGame.deserialize(saved);
        h2.state.events.emit(GameState.EventTypes["event:state.onRender"]);
        // The remount. Every waiting request fires, including the one armed above - and `main` is
        // suspended now, which it was not when the request was made.
        h2.mount();
        for (let i = 0; i < 12; i++) {
            await tick();
        }

        expect(h2.state.isSceneSuspended(second.main)).toBe(true);
        expect(second.theme.state.paused).toBe(true);
        expect(tokenOf(h2, second.theme).isPaused()).toBe(true);
        // The only thing the graph was asked to start is the restore, at the saved position. A
        // second start - at the top of the file - is the parked track playing over the callee.
        expect(timeline.filter(entry => entry.startsWith("start:/theme.mp3")))
            .toEqual(["start:/theme.mp3@17.50"]);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 8. Mute.
 * ------------------------------------------------------------------------------------------- */

describe("a track muted before the call", () => {
    it("stays muted through suspension and resumption", async () => {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme });
        sub.action([mark(log, "B1")] as never);
        main.action([
            mark(log, "A1"),
            run(state => state.audioManager.mute(theme, true)),
            advance(6),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);

        const h = await harness(log, main, [main, sub]);
        h.liveGame.newGame();
        await driveUntil(h, "B1");

        expect(theme.state.muted).toBe(true);
        expect(tokenOf(h, theme).isMuted()).toBe(true);
        expect(tokenOf(h, theme).isPaused()).toBe(true);

        await drive(h);
        expect(log).toEqual(["A1", "B1", "A2"]);

        // Resuming a clip is a transport change, not a mix change: it must not un-mute it.
        expect(theme.state.muted).toBe(true);
        expect(tokenOf(h, theme).isMuted()).toBe(true);
        expect(tokenOf(h, theme).isPlaying()).toBe(true);
        expect(h.state.audioManager.getPosition(theme)).toBeCloseTo(6, 5);
    });
});

/* ------------------------------------------------------------------------------------------- *
 * 9. A plain jump that abandons an open call.
 * ------------------------------------------------------------------------------------------- */

describe("a plain jump taken while a call is open", () => {
    function abandonStory() {
        const theme = Sound.bgm({ src: "/theme.mp3", loop: true });
        const log: string[] = [];
        const away = new Scene("away");
        const sub = new Scene("sub");
        const main = new Scene("main", { backgroundMusic: theme });
        away.action([mark(log, "C1")] as never);
        sub.action([mark(log, "B1"), sub.jumpTo(away)] as never);
        main.action([
            mark(log, "A1"),
            advance(4),
            main.jumpTo(sub, { returnable: true }),
            mark(log, "A2"),
        ] as never);
        return { log, main, sub, away, theme };
    }

    /**
     * The correct behaviour, and what the engine does.
     *
     * A plain jump gives up the call stack, so the parked scenes are never coming back and their
     * tracks are never going to be resumed by anything. Leaving one paused would hold a token, a
     * gain node and a decoded buffer for a scene no player can reach - so they have to be stopped,
     * exactly as a scene's track is stopped when a plain jump unloads it.
     *
     * That is what happens, and it is worth knowing *where*: `SceneAction.unwindCallStack` only
     * emits `event:scene.preUnmount`, and the listener that turns that into
     * `AudioManager.stop` lives in `Scene.tsx`. It fires because a suspended scene is still
     * mounted - suspension hides a scene, it does not unmount it. The harness registers that same
     * listener, so this asserts the shipped arrangement rather than a stand-in of its own.
     */
    it("stops every parked track rather than leaving it paused forever", async () => {
        const { log, main, sub, away, theme } = abandonStory();
        const h = await harness(log, main, [main, sub, away]);

        h.liveGame.newGame();
        await driveUntil(h, "B1");
        const parked = tokenOf(h, theme);
        expect(parked.isPaused()).toBe(true);

        await drive(h);
        expect(log).toEqual(["A1", "B1", "C1"]);
        expect(h.state.getSuspendedScenes()).toEqual([]);

        // The channel is released: the manager is no longer holding the clip, and the token is
        // stopped rather than parked.
        expect(h.state.audioManager.isManaged(theme)).toBe(false);
        expect(parked.isPlaying()).toBe(false);
        expect(parked.isPaused()).toBe(false);
        expect(timeline).toContain("stop:/theme.mp3");
        expect(timeline).not.toContain("resume:/theme.mp3");
        expect(h.state.audioManager.toData().sounds.map(([id]) => id)).not.toContain(theme.getId());
    });

    /**
     * A residual, and the shape of the fix if it is ever worth making.
     *
     * `AudioManager.stop` does not clear `sound.state.paused`, so the abandoned clip is left
     * describing itself as paused while it is in fact stopped. Nothing observable follows from it
     * today - the manager no longer holds the clip, so no save record is written for it, and every
     * path that starts a clip again (`play`, `playSoundToken`, `soundFromData`) rewrites the flag
     * before anything can read it. This pins the current answer so a future reader of
     * `state.paused` finds out that it is not trustworthy for a stopped clip.
     */
    it("leaves the abandoned clip's own `paused` flag set, which nothing currently reads", async () => {
        const { log, main, sub, away, theme } = abandonStory();
        const h = await harness(log, main, [main, sub, away]);

        h.liveGame.newGame();
        await drive(h);

        expect(h.state.audioManager.isManaged(theme)).toBe(false);
        expect(theme.state.paused).toBe(true);
    });
});
