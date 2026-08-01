import { describe, expect, it, vi, beforeEach } from "vitest";
import { Sound, SoundType } from "@core/elements/sound";
import { SoundAction } from "@core/action/actions/soundAction";
import { SoundActionTypes } from "@core/action/actionTypes";
import { ContentNode } from "@core/action/tree/actionTree";
import { Awaitable } from "@lib/util/data";
import { AudioBusDeclaration, AudioBusMixer, DefaultAudioBusIds } from "@core/game/audioBus";
import { AudioManager } from "./AudioManager";

/** Let the fire-and-forget `ready.then(...)` chains (initialize, soundFromData) run. */
async function settle(): Promise<void> {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
}

/** What `channel.play` was asked for. The in/out points of a clip are read here and nowhere else. */
type PlayOptionsRecord = {
    volume?: number;
    startTime?: number;
    endTime?: number;
    loop?: boolean;
    rate?: number;
};

/** The Web Audio node the backend plays a decoded clip through, as far as the loop region cares. */
type SourceNodeMock = {
    loop: boolean;
    loopStart: number;
    loopEnd: number;
};

type ChannelMock = {
    setVolume: ReturnType<typeof vi.fn>;
    play: (source: unknown, options?: PlayOptionsRecord) => Promise<Record<string, unknown>>;
    played: PlayOptionsRecord[];
    token: Record<string, ReturnType<typeof vi.fn>> & { seek: ReturnType<typeof vi.fn> };
    node: SourceNodeMock;
};

/**
 * `AudioManager` reaches the buffer source through `token.sourceController.getSource()` and checks
 * the result with `instanceof AudioBufferSourceNode` - a global that does not exist outside a
 * browser, so the seam needs one to exist at all.
 */
const audio = vi.hoisted(() => {
    class AudioBufferSourceNodeStub {
        public loop = false;
        public loopStart = 0;
        public loopEnd = 0;
    }
    (globalThis as unknown as Record<string, unknown>).AudioBufferSourceNode = AudioBufferSourceNodeStub;
    return { AudioBufferSourceNodeStub };
});

const soundMock = vi.hoisted(() => ({
    instances: [] as Array<{
        channels: Map<string, any>;
        createdChannels: string[];
        readyResolvers: Array<() => void>;
        loaded: string[];
        loadRejection: Error | null;
        options: Record<string, unknown> | undefined;
    }>,
}));

/**
 * The backend, mocked as the **graph it actually is**.
 *
 * A channel owns a gain node, a child channel's gain feeds its parent's, and a token plays into
 * the gain of the channel it was created on. Modelling that rather than a flat map of names is
 * what lets a test say something true about cascading volume - `effectiveGain()` below is the
 * product every clip on a channel is multiplied by, and it is the only thing a bus change touches.
 */
vi.mock("@narraleaf/sound", () => {
    const clamp = (value: number) => Math.max(0, Math.min(1, value));

    class GainParamStub {
        public value = 1;
        public cancelScheduledValues = vi.fn();
        public setValueAtTime = vi.fn((value: number) => {
            this.value = value;
        });
        public setTargetAtTime = vi.fn();
    }

    class ChannelStub {
        public readonly gainNode = { gain: new GainParamStub() };
        public readonly subChannels = new Map<string, ChannelStub>();
        public readonly played: Record<string, unknown>[] = [];
        public readonly node = new audio.AudioBufferSourceNodeStub();
        public readonly token: Record<string, any>;
        public volume: number;
        public setVolume: ReturnType<typeof vi.fn>;

        constructor(
            public readonly name: string,
            private readonly sound: any,
            options: { volume?: number } = {},
            public readonly parent: ChannelStub | null = null,
        ) {
            this.volume = clamp(options.volume ?? 1);
            this.gainNode.gain.value = this.volume;
            const node = this.node;
            this.token = {
                sourceController: { getSource: () => node },
                mute: vi.fn(),
                unmute: vi.fn(),
                setVolume: vi.fn(),
                setRate: vi.fn(),
                seek: vi.fn(),
                pause: vi.fn(),
                resume: vi.fn(),
                stop: vi.fn(),
                isPlaying: vi.fn(() => true),
                isPaused: vi.fn(() => false),
                getCurrentTime: vi.fn(() => 0),
                getVolume: vi.fn(() => 1),
                getDuration: vi.fn(() => 0),
                fade: vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn(), finish: vi.fn() })),
                once: vi.fn(),
                on: vi.fn(),
                off: vi.fn(),
            };
            // The real `Channel.setVolume` writes `gain.value` bare - that bare write is the zipper
            // the manager has to supersede, so the stub reproduces it exactly.
            this.setVolume = vi.fn((volume: number) => {
                this.volume = clamp(volume);
                this.gainNode.gain.value = this.volume;
                return this;
            });
        }

        getName(): string {
            return this.name;
        }

        getGainNode() {
            return this.gainNode;
        }

        getVolume(): number {
            return this.volume;
        }

        getParent(): ChannelStub | null {
            return this.parent;
        }

        /** What every clip playing on this channel is multiplied by, master included. */
        effectiveGain(): number {
            return this.gainNode.gain.value * (this.parent ? this.parent.effectiveGain() : 1);
        }

        createChannel(name: string, options: { volume?: number } = {}): ChannelStub {
            if (this.subChannels.has(name)) {
                throw new Error(`Channel "${name}" already exists under "${this.name}".`);
            }
            const channel = new ChannelStub(name, this.sound, options, this);
            this.subChannels.set(name, channel);
            this.sound.createdChannels.push(name);
            this.sound.channels.set(name, channel);
            return channel;
        }

        getChannel(name: string): ChannelStub | null {
            return this.subChannels.get(name) ?? null;
        }

        play(_source: unknown, options: Record<string, unknown> = {}) {
            this.played.push(options);
            return Promise.resolve(this.token);
        }
    }

    class Sound {
        /** Every channel anywhere in the tree, by name - the tests look them up flat. */
        public channels = new Map<string, ChannelStub>();
        public createdChannels: string[] = [];
        public readyResolvers: Array<() => void> = [];
        public loaded: string[] = [];
        public loadRejection: Error | null = null;
        public options: Record<string, unknown> | undefined;
        public context = { currentTime: 0 };
        private master: ChannelStub;

        constructor(options?: Record<string, unknown>) {
            this.options = options;
            this.master = new ChannelStub("__master__", this, {}, null);
            soundMock.instances.push(this);
        }

        load(path: string): Promise<unknown> {
            if (this.loadRejection) {
                return Promise.reject(this.loadRejection);
            }
            this.loaded.push(path);
            return Promise.resolve({ path });
        }

        onceReady(): Promise<Sound> {
            return new Promise<void>(resolve => {
                this.readyResolvers.push(resolve);
            }).then(() => this);
        }

        setVolume(): void {}

        getAudioContext() {
            return this.context;
        }

        createChannel(name: string, options: { volume?: number } = {}): ChannelStub {
            return this.master.createChannel(name, options);
        }

        /** Direct children of master only, exactly like the real one. */
        getChannel(name: string): ChannelStub | null {
            return this.master.getChannel(name);
        }
    }

    return {
        Sound,
        Channel: class {},
        SoundToken: class {},
    };
});

function createGameState(
    declarations: AudioBusDeclaration[] = [],
    preferences: Partial<Record<"soundVolume" | "bgmVolume" | "voiceVolume", number>> = {},
) {
    return {
        game: {
            preference: {
                getPreferences: () => ({
                    soundVolume: 1,
                    bgmVolume: 1,
                    voiceVolume: 1,
                    ...preferences,
                }),
            },
            audioBuses: new AudioBusMixer(() => declarations),
        },
        logger: {
            error: vi.fn(),
            weakWarn: vi.fn(),
        },
    } as any;
}

/** Only `config.src` is read by `preload`. */
function soundLike(src: string) {
    return { config: { src } } as any;
}

describe("AudioManager", () => {
    beforeEach(() => {
        soundMock.instances.length = 0;
    });

    it("does not create duplicate default channels while initialization is pending", async () => {
        const manager = new AudioManager(createGameState());

        manager.initialize();
        manager.initialize();

        expect(soundMock.instances).toHaveLength(1);
        const sound = soundMock.instances[0];
        expect(sound.createdChannels).toEqual([]);

        sound.readyResolvers.forEach(resolve => resolve());
        await Promise.resolve();
        await Promise.resolve();

        // The seeded three, not `Object.values(SoundType)` - the enum is no longer what decides
        // which channels exist, the declared tree is, and it seeds these three whatever the host says.
        expect(sound.createdChannels.sort()).toEqual(["bgm", "sound", "voice"]);
        manager.initialize();
        expect(soundMock.instances).toHaveLength(1);
        expect(sound.createdChannels.sort()).toEqual(["bgm", "sound", "voice"]);
    });

    it("rejects a malformed bus declaration at the point the player mounts", () => {
        const manager = new AudioManager(createGameState([{ id: "a", parentId: "b" }]));

        // Not inside the `onceReady` chain: there it would land later as an unhandled rejection,
        // and the game would look like it simply had no sound.
        expect(() => manager.initialize()).toThrow(/unknown parent/);
        expect(soundMock.instances).toHaveLength(0);
    });

    it("asks the backend for a channel budget a large voiced cast cannot exhaust", () => {
        const manager = new AudioManager(createGameState());
        manager.initialize();

        // The backend defaults to 128 *including* master and throws outright at the cap, so a game
        // with a bus per character used to have a hard ceiling it could walk into at boot.
        expect((soundMock.instances[0].options as { maxChannels: number }).maxChannels)
            .toBeGreaterThanOrEqual(512);
    });
});

/**
 * The bus tree the host declares, realized into the backend's channel graph.
 */
describe("AudioManager bus tree", () => {
    beforeEach(() => {
        soundMock.instances.length = 0;
    });

    async function boot(declarations: AudioBusDeclaration[], preferences = {}) {
        const gameState = createGameState(declarations, preferences);
        const manager = new AudioManager(gameState);
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.readyResolvers.forEach((resolve: () => void) => resolve());
        await settle();
        return { manager, sound, gameState };
    }

    it("creates a declared bus under its declared parent", async () => {
        const { sound } = await boot([
            { id: "cast", parentId: "voice" },
            { id: "alice", parentId: "cast", volume: 0.5 },
        ]);

        expect(sound.channels.get("cast").getParent().getName()).toBe("voice");
        expect(sound.channels.get("alice").getParent().getName()).toBe("cast");
        // Cascading gain is the graph's job, not arithmetic here: 0.5 under two full buses.
        expect(sound.channels.get("alice").effectiveGain()).toBeCloseTo(0.5);
    });

    it("honours a declared volume on a seeded bus, which the preference aliases used to erase", async () => {
        // The regression this pins: `setupGroupVolume` applies the four volume preferences at init,
        // their defaults are 1, and they used to be written as the bus's whole gain - so an author
        // who mixed SFX to 60% in Studio shipped a game every player heard at 100%, while a custom
        // bus with the identical declaration was honoured. A run could not tell "declared 0.6 then
        // clobbered to 1" apart from "never declared"; this can.
        const { sound } = await boot([
            { id: DefaultAudioBusIds.sound, volume: 0.6 },
            { id: "alice", parentId: "voice", volume: 0.6 },
        ]);

        expect(sound.channels.get("sound").getVolume()).toBeCloseTo(0.6);
        expect(sound.channels.get("alice").getVolume()).toBeCloseTo(0.6);
    });

    it("multiplies the player's slider onto the author's mix rather than replacing it", async () => {
        const { manager, sound } = await boot(
            [{ id: DefaultAudioBusIds.sound, volume: 0.6 }],
            { soundVolume: 0.5 },
        );

        // Author 0.6, player 0.5.
        expect(sound.channels.get("sound").getVolume()).toBeCloseTo(0.3);

        // ...and a player pushing the slider to maximum gets the author's intent back, not a bus
        // at full gain. The two numbers are separate, so neither can erase the other.
        manager.setBusVolume(DefaultAudioBusIds.sound, 1);
        expect(sound.channels.get("sound").getVolume()).toBeCloseTo(0.6);
        expect(manager.getBuses().find(bus => bus.id === "sound"))
            .toMatchObject({ volume: 1, declaredVolume: 0.6, effectiveVolume: 0.6 });
    });

    it("layers declared, then a persisted player override, then a live change", async () => {
        const gameState = createGameState([{ id: "alice", parentId: "voice", volume: 0.8 }]);
        // Restored out of the host's storage before the audio context ever unlocks.
        gameState.game.audioBuses.setVolumes({ alice: 0.5 });
        const manager = new AudioManager(gameState);
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.readyResolvers.forEach((resolve: () => void) => resolve());
        await settle();

        expect(sound.channels.get("alice").getVolume()).toBeCloseTo(0.4);

        manager.setBusVolume("alice", 0.25);
        expect(sound.channels.get("alice").getVolume()).toBeCloseTo(0.2);
        // The declaration is still 0.8 underneath - the live change replaced the override, not it.
        expect(gameState.game.audioBuses.getDeclaredVolume("alice")).toBe(0.8);
    });

    it("realizes parents before children whatever order they were declared in", async () => {
        // Deliberately back to front: a child names a parent that has not been declared yet.
        const { sound } = await boot([
            { id: "alice", parentId: "cast" },
            { id: "cast", parentId: "voice" },
        ]);

        const created = sound.createdChannels as string[];
        expect(created.indexOf("cast")).toBeLessThan(created.indexOf("alice"));
        expect(created.indexOf("voice")).toBeLessThan(created.indexOf("cast"));
    });

    it("keeps the seeded three when the host declares nothing", async () => {
        const { sound, manager } = await boot([]);

        expect(sound.createdChannels.sort()).toEqual(["bgm", "sound", "voice"]);
        expect(manager.getBuses().map(bus => bus.id).sort()).toEqual(["bgm", "sound", "voice"]);
    });

    it("lets a host re-parent a seeded bus rather than replace it", async () => {
        const { sound } = await boot([
            { id: "diegetic" },
            { id: DefaultAudioBusIds.voice, parentId: "diegetic" },
        ]);

        expect(sound.channels.get("voice").getParent().getName()).toBe("diegetic");
        expect(sound.channels.get("bgm").getParent().getName()).toBe("__master__");
    });

    it("routes a clip on an undeclared bus somewhere audible instead of failing", async () => {
        const { manager, sound, gameState } = await boot([]);

        await manager.playSoundToken(Sound.voice({ src: "line.mp3", type: "alicce" }));

        expect(gameState.logger.weakWarn).toHaveBeenCalled();
        expect(sound.channels.get("sound").played).toHaveLength(1);
    });
});

/**
 * Per-bus volume, and the four preferences that alias onto the seeded three.
 */
describe("AudioManager bus volume", () => {
    beforeEach(() => {
        soundMock.instances.length = 0;
    });

    async function boot(declarations: AudioBusDeclaration[] = [], preferences = {}) {
        const gameState = createGameState(declarations, preferences);
        const manager = new AudioManager(gameState);
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.readyResolvers.forEach((resolve: () => void) => resolve());
        await settle();
        return { manager, sound, gameState };
    }

    it("reaches a sound that is already playing, without touching its token", async () => {
        const { manager, sound } = await boot([{ id: "alice", parentId: "voice" }]);
        const line = Sound.voice({ src: "alice-01.mp3", type: "alice" });
        await manager.playSoundToken(line);
        const channel = sound.channels.get("alice");
        const before = channel.effectiveGain();

        manager.setBusVolume("voice", 0.5);

        // Nothing hunted down the live token; the bus it is routed through simply moved.
        expect(channel.token.setVolume).toHaveBeenCalledTimes(1); // only the initial play volume
        expect(channel.effectiveGain()).toBeCloseTo(before * 0.5);
    });

    it("ramps a bus change instead of stepping it", async () => {
        const { manager, sound } = await boot();
        const gain = sound.channels.get("bgm").gainNode.gain;
        gain.setValueAtTime.mockClear();
        gain.cancelScheduledValues.mockClear();

        manager.setBusVolume("bgm", 0.2);

        // The bare `gain.value = x` the backend performs is dropped and replaced by a ramp; without
        // the cancel it would remain scheduled and the ramp would start from the wrong place.
        expect(gain.cancelScheduledValues).toHaveBeenCalled();
        expect(gain.setTargetAtTime).toHaveBeenCalledWith(0.2, 0, 0.02);
        // ...and the exact target is pinned afterwards, because setTargetAtTime never arrives.
        expect(gain.setValueAtTime).toHaveBeenCalledWith(0.2, expect.any(Number));
    });

    it("keeps the channel's own bookkeeping equal to the value it drives", async () => {
        const { manager, sound } = await boot();

        manager.setBusVolume("bgm", 0.25);

        // The gain parameter is what is heard; `Channel.volume` is what `mute()`/`unmute()` and
        // `getVolume()` read. One writer, so they cannot drift.
        expect(sound.channels.get("bgm").getVolume()).toBe(0.25);
        expect(manager.getBusVolume("bgm")).toBe(0.25);
    });

    it("clamps out-of-range volume rather than letting a bus boost", async () => {
        const { manager } = await boot();

        manager.setBusVolume("bgm", 4);
        expect(manager.getBusVolume("bgm")).toBe(1);

        manager.setBusVolume("bgm", -1);
        expect(manager.getBusVolume("bgm")).toBe(0);
    });

    it("drives the seeded buses from the three volume preferences", async () => {
        const { sound } = await boot([], { bgmVolume: 0.3, soundVolume: 0.4, voiceVolume: 0.5 });

        // `setupGroupVolume` still destructures exactly these three keys - they are aliases onto
        // buses now, but a player's music/sfx/voice sliders are unchanged.
        expect(sound.channels.get("bgm").getVolume()).toBeCloseTo(0.3);
        expect(sound.channels.get("sound").getVolume()).toBeCloseTo(0.4);
        expect(sound.channels.get("voice").getVolume()).toBeCloseTo(0.5);
    });

    it("applies a volume set before the audio context unlocked", async () => {
        const gameState = createGameState([{ id: "alice", parentId: "voice" }]);
        const manager = new AudioManager(gameState);
        // A host restoring its saved mixer has no reason to wait for a user gesture first.
        manager.setBusVolume("alice", 0.1);
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.readyResolvers.forEach((resolve: () => void) => resolve());
        await settle();

        expect(sound.channels.get("alice").getVolume()).toBeCloseTo(0.1);
    });

    it("hands a host the whole tree with both numbers, and persists only the player's", async () => {
        const { manager } = await boot([{ id: "alice", parentId: "voice", volume: 0.8 }]);
        manager.setBusVolume("alice", 0.5);

        expect(manager.getBuses()).toContainEqual({
            id: "alice", parentId: "voice", volume: 0.5, declaredVolume: 0.8, effectiveVolume: 0.4,
        });
        // 0.5, not 0.4: the author's mix is game content and comes back with the game, so an
        // author who re-mixes a shipped title is not overruled by a returning player's saved file.
        expect(manager.toData().groups).toContainEqual(["alice", 0.5]);
    });

    it("restores bus volumes out of a save, including one written before buses existed", async () => {
        const { manager, sound } = await boot([{ id: "alice", parentId: "voice" }]);

        manager.fromData(
            { sounds: [], groups: [["bgm", 0.6], ["alice", 0.2]] },
            new Map(),
        );

        expect(sound.channels.get("bgm").getVolume()).toBeCloseTo(0.6);
        expect(sound.channels.get("alice").getVolume()).toBeCloseTo(0.2);
    });

    it("re-applies every declared bus on reset, not just the enum's three", async () => {
        const { manager, sound } = await boot([{ id: "alice", parentId: "voice" }]);
        manager.setBusVolume("alice", 0.15);
        sound.channels.get("alice").setVolume.mockClear();

        manager.reset();

        // A bus volume is a player setting: starting a new game must not un-mute the character
        // the player turned off.
        expect(sound.channels.get("alice").setVolume).toHaveBeenCalledWith(0.15);
        expect(manager.getBusVolume("alice")).toBe(0.15);
    });
});

/**
 * A scene whose BGM is still being fetched when it opens stutters into its own first line, so the
 * preloader warms the audio cache too. The audio context only unlocks on a user gesture, which is
 * exactly why nothing may block on this.
 */
describe("AudioManager.preload", () => {
    beforeEach(() => {
        soundMock.instances.length = 0;
    });

    it("loads the source into the audio cache without playing it", async () => {
        const manager = new AudioManager(createGameState());
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.readyResolvers.forEach(resolve => resolve());

        await manager.preload(soundLike("bgm.mp3"));

        expect(sound.loaded).toEqual(["bgm.mp3"]);
    });

    it("stays pending while the audio context is still locked", async () => {
        const manager = new AudioManager(createGameState());
        manager.initialize();
        const sound = soundMock.instances[0];

        let settled = false;
        void manager.preload(soundLike("bgm.mp3")).then(() => {
            settled = true;
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(settled).toBe(false);
        expect(sound.loaded).toEqual([]);

        sound.readyResolvers.forEach(resolve => resolve());
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(settled).toBe(true);
        expect(sound.loaded).toEqual(["bgm.mp3"]);
    });

    it("resolves quietly when the source cannot be loaded", async () => {
        const gameState = createGameState();
        const manager = new AudioManager(gameState);
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.loadRejection = new Error("404");
        sound.readyResolvers.forEach(resolve => resolve());

        await expect(manager.preload(soundLike("missing.mp3"))).resolves.toBeUndefined();
        expect(gameState.logger.weakWarn).toHaveBeenCalled();
    });
});

/**
 * The in and out points an author marks on a clip.
 *
 * They only exist for the audio backend, which turns `startTime` + `endTime` + `loop` into the Web
 * Audio node's own loop region - so every assertion here is about what reaches `channel.play`.
 */
describe("AudioManager clip regions", () => {
    beforeEach(() => {
        soundMock.instances.length = 0;
    });

    /** A manager whose audio context has already unlocked, plus the channel a given type plays on. */
    async function readyManager(type: SoundType) {
        const manager = new AudioManager(createGameState());
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.readyResolvers.forEach(resolve => resolve());
        await settle();
        return { manager, channel: sound.channels.get(type) as unknown as ChannelMock };
    }

    it("plays an in/out point pair as a loop region", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);

        await manager.playSoundToken(Sound.bgm({ src: "theme.mp3", loop: true, seek: 2, endTime: 30 }));

        // `endTime` must NOT reach the backend here. It turns into a timer that stops the token after
        // one pass whether or not the clip loops, so handing it over is exactly what stopped the loop
        // region from ever repeating. The region goes onto the node instead.
        expect(channel.played[0]).toMatchObject({ startTime: 2, loop: true });
        expect(channel.played[0] && "endTime" in channel.played[0]).toBe(false);
        expect(channel.node).toMatchObject({ loop: true, loopStart: 2, loopEnd: 30 });
    });

    it("repeats from a loop in point of its own when one is given", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);

        await manager.playSoundToken(Sound.bgm({
            src: "theme.mp3", loop: true, seek: 0, loopStart: 12, endTime: 90,
        }));

        // The intro plays once from the top; every repeat after that returns to 12s, not to 0s.
        expect(channel.played[0]?.startTime).toBe(0);
        expect(channel.node).toMatchObject({ loop: true, loopStart: 12, loopEnd: 90 });
    });

    it("ignores a loop in point that falls outside the region", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);

        await manager.playSoundToken(Sound.bgm({
            src: "theme.mp3", loop: true, seek: 2, loopStart: 120, endTime: 30,
        }));

        // A repeat that starts at or after the out point is a zero-length loop - silence forever.
        expect(channel.node).toMatchObject({ loopStart: 2, loopEnd: 30 });
    });

    it("hands a one-shot's out point straight to the backend", async () => {
        const { manager, channel } = await readyManager(SoundType.Sound);

        await manager.playSoundToken(Sound.sound({ src: "line.mp3", seek: 1, endTime: 4 }));

        // Without `loop` the backend's stop-at-duration timer *is* the out point, and there is no
        // loop region to write.
        expect(channel.played[0]).toMatchObject({ startTime: 1, endTime: 4, loop: false });
        expect(channel.node.loop).toBe(false);
    });

    it("drops an out point that is not after the in point", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);

        await manager.playSoundToken(Sound.bgm({ src: "theme.mp3", loop: true, seek: 12, endTime: 4 }));

        // An inverted region describes nothing playable, and passing it through would stop the clip
        // the instant it started - which reads as a broken asset rather than a bad marker.
        expect(channel.played[0]?.startTime).toBe(12);
        expect(channel.played[0] && "endTime" in channel.played[0]).toBe(false);
    });

    it("honours the configured playback rate", async () => {
        const { manager, channel } = await readyManager(SoundType.Sound);

        await manager.playSoundToken(Sound.sound({ src: "hit.wav", rate: 1.5 }));

        expect(channel.played[0]?.rate).toBe(1.5);
    });

    it("clamps a seek past the out point back to the in point", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);
        const sound = Sound.bgm({ src: "theme.mp3", loop: true, seek: 2, endTime: 30 });
        await manager.playSoundToken(sound);

        manager.seek(sound, 99);

        // Outside the region the loop never brings the play head back, so the track would run to the
        // end of the file and stop.
        expect(channel.token.seek).toHaveBeenCalledWith(2);
    });

    it("does nothing when seeking a sound that is not playing", async () => {
        const { manager, channel } = await readyManager(SoundType.Sound);

        manager.seek(Sound.sound({ src: "hit.wav" }), 4);

        expect(channel.token.seek).not.toHaveBeenCalled();
    });

    it("restores a save at the in point and seeks forward, keeping the loop anchored", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);

        manager.soundFromData(
            Sound.bgm({ src: "theme.mp3", loop: true, seek: 2, endTime: 30 }),
            { isPlaying: true, position: 12 },
        );
        await settle();

        // Restoring straight at 12 would make every later repeat return to 12 instead of the in
        // point, silently shrinking the author's loop for the rest of the session.
        expect(channel.played[0]?.startTime).toBe(2);
        expect(channel.node).toMatchObject({ loop: true, loopStart: 2, loopEnd: 30 });
        expect(channel.token.seek).toHaveBeenCalledWith(12);
    });

    it("restores a region-less sound straight at its saved position", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);

        manager.soundFromData(Sound.bgm({ src: "theme.mp3", loop: true }), { isPlaying: true, position: 12 });
        await settle();

        expect(channel.played[0]?.startTime).toBe(12);
        expect(channel.token.seek).not.toHaveBeenCalled();
    });
});

/**
 * A `Sound` carries the volume it was configured with. A caller that passes no `FadeOptions` is
 * saying nothing about volume, which means "the clip's own" - it used to mean "full".
 */
describe("AudioManager default volume", () => {
    beforeEach(() => {
        soundMock.instances.length = 0;
    });

    async function readyManager(type: SoundType) {
        const manager = new AudioManager(createGameState());
        manager.initialize();
        const sound = soundMock.instances[0];
        sound.readyResolvers.forEach(resolve => resolve());
        await settle();
        return { manager, channel: sound.channels.get(type) as unknown as ChannelMock };
    }

    it("starts a clip at its configured volume, not at full", async () => {
        const { manager, channel } = await readyManager(SoundType.Sound);
        const sound = Sound.sound({ src: "hit.wav", volume: 0.4 });

        // This is `LiveGame.playSound`'s exact call: no options at all. It used to hand the token
        // `1`, so every clip a host played through it was at full volume however it was configured.
        await manager.playSoundToken(sound);

        expect(channel.token.setVolume).toHaveBeenCalledWith(0.4);
        expect(channel.token.setVolume).not.toHaveBeenCalledWith(1);
        expect(sound.state.volume).toBe(0.4);
    });

    it("leaves no ramp running, so a volume set on the returned token wins", async () => {
        const { manager, channel } = await readyManager(SoundType.Sound);

        const token = await manager.playSoundToken(Sound.sound({ src: "hit.wav", volume: 0.4 }));
        token.setVolume(0.9);

        // A host that resolves its own volume after play must be the last writer. A non-zero default
        // fade would break that: `token.fade` is not awaited, so the ramp would outlive the return
        // and run straight over this call.
        expect(channel.token.fade).not.toHaveBeenCalled();
        expect(channel.token.setVolume.mock.calls.map(call => call[0])).toEqual([0.4, 0.9]);
    });

    it("ramps an explicit fade to the configured volume rather than to full", async () => {
        const { manager, channel } = await readyManager(SoundType.Bgm);
        const music = Sound.bgm({ src: "theme.mp3", loop: true, volume: 0.4 });

        await manager.playSoundToken(music, { end: music.state.volume, duration: 800 });

        expect(channel.token.fade).toHaveBeenCalledWith(0, 0.4, 800);
        expect(channel.token.setVolume).not.toHaveBeenCalled();
    });

    it("honours an explicit target that differs from the configured volume", async () => {
        const { manager, channel } = await readyManager(SoundType.Sound);
        const sound = Sound.sound({ src: "hit.wav", volume: 0.4 });

        await manager.playSoundToken(sound, { end: 1, duration: 0 });

        expect(channel.token.setVolume).toHaveBeenCalledWith(1);
        expect(sound.state.volume).toBe(1);
    });

    it("plays a dialog's voice at the volume it was configured with", async () => {
        const { manager, channel } = await readyManager(SoundType.Voice);
        const voice = Sound.voice({ src: "line.mp3", volume: 0.25 });

        // `CharacterAction` plays a line's voice with no options either - the same defaulting bug
        // reached it, so a voice track mixed down against the music came out at full volume.
        // Not awaited: `play` settles when the clip *ends*, and a mock token never ends.
        manager.play(voice);
        await settle();

        expect(channel.token.setVolume).toHaveBeenCalledWith(0.25);
        expect(channel.token.setVolume).not.toHaveBeenCalledWith(1);
    });

    it("restarts at the volume it was last set to, not the one it was authored with", async () => {
        const { manager, channel } = await readyManager(SoundType.Sound);
        const sound = Sound.sound({ src: "hit.wav", volume: 0.4 });

        await manager.playSoundToken(sound);
        manager.setVolume(sound, 0.1);
        await manager.playSoundToken(sound);

        // The default reads `state`, which is what `Sound.play()` and `Sound.resume()` already put in
        // their own `FadeOptions` - so a replay does not undo a volume change made in between.
        expect(channel.token.setVolume).toHaveBeenLastCalledWith(0.1);
    });
});

describe("AudioManager.fromData", () => {
    beforeEach(() => {
        soundMock.instances.length = 0;
    });

    it("skips a saved sound this story has no element for", () => {
        const gameState = createGameState();
        const manager = new AudioManager(gameState);
        manager.initialize();

        // A host playing a UI sound through `LiveGame.playSound` owns it, and it is not in the
        // story's element map. Throwing here failed the entire load over one clip that had no
        // business resuming anyway.
        expect(() => manager.fromData(
            { sounds: [["not-in-this-story", { isPlaying: true, position: 3 }]], groups: [] },
            new Map(),
        )).not.toThrow();
        expect(gameState.logger.weakWarn).toHaveBeenCalled();
    });
});

describe("the seek action", () => {
    it("moves the play head and records the previous position for undo", () => {
        const seek = vi.fn(() => Awaitable.resolve<void>(undefined));
        const pushed: { undo?: (...args: never[]) => void; args?: unknown[] } = {};
        const sound = Sound.bgm({ src: "theme.mp3", loop: true });
        const state = {
            audioManager: { seek, getPosition: () => 7 },
            timelines: { attachTimeline: vi.fn() },
            actionHistory: {
                push: (_props: unknown, undo: (...args: never[]) => void, args: unknown[]) => {
                    pushed.undo = undo;
                    pushed.args = args;
                    return { id: "x" };
                },
            },
        };

        new SoundAction(
            { getSelf: () => sound } as never,
            SoundActionTypes.seek,
            new ContentNode().setContent([30]) as never,
        ).executeAction(state as never, { stackModel: {} } as never);

        expect(seek).toHaveBeenCalledWith(sound, 30);
        // The play head is not part of the serialized state, so nothing else would carry it back.
        expect(pushed.args).toEqual([7]);
        pushed.undo?.(...([7] as never[]));
        expect(seek).toHaveBeenLastCalledWith(sound, 7);
    });
});
