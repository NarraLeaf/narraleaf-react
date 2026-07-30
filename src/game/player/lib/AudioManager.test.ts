import { describe, expect, it, vi, beforeEach } from "vitest";
import { Sound, SoundType } from "@core/elements/sound";
import { SoundAction } from "@core/action/actions/soundAction";
import { SoundActionTypes } from "@core/action/actionTypes";
import { ContentNode } from "@core/action/tree/actionTree";
import { Awaitable } from "@lib/util/data";
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

type ChannelMock = {
    setVolume: ReturnType<typeof vi.fn>;
    play: (source: unknown, options?: PlayOptionsRecord) => Promise<Record<string, unknown>>;
    played: PlayOptionsRecord[];
    token: Record<string, ReturnType<typeof vi.fn>> & { seek: ReturnType<typeof vi.fn> };
};

const soundMock = vi.hoisted(() => ({
    instances: [] as Array<{
        channels: Map<string, { setVolume: ReturnType<typeof vi.fn> }>;
        createdChannels: string[];
        readyResolvers: Array<() => void>;
        loaded: string[];
        loadRejection: Error | null;
    }>,
}));

vi.mock("@narraleaf/sound", () => {
    class Sound {
        public channels = new Map<string, { setVolume: ReturnType<typeof vi.fn> }>();
        public createdChannels: string[] = [];
        public readyResolvers: Array<() => void> = [];
        public loaded: string[] = [];
        public loadRejection: Error | null = null;

        constructor() {
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

        createChannel(name: string): { setVolume: ReturnType<typeof vi.fn> } {
            if (this.channels.has(name)) {
                throw new Error(`Channel "${name}" already exists under "__master__".`);
            }
            const token = {
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
            const played: Record<string, unknown>[] = [];
            const channel = {
                setVolume: vi.fn(),
                token,
                played,
                play: (_source: unknown, options: Record<string, unknown> = {}) => {
                    played.push(options);
                    return Promise.resolve(token);
                },
            };
            this.createdChannels.push(name);
            this.channels.set(name, channel);
            return channel;
        }

        getChannel(name: string): { setVolume: ReturnType<typeof vi.fn> } | null {
            return this.channels.get(name) ?? null;
        }
    }

    return {
        Sound,
        Channel: class {},
        SoundToken: class {},
    };
});

function createGameState() {
    return {
        game: {
            preference: {
                getPreferences: () => ({
                    soundVolume: 1,
                    bgmVolume: 1,
                    voiceVolume: 1,
                }),
            },
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

        expect(sound.createdChannels.sort()).toEqual(Object.values(SoundType).sort());
        manager.initialize();
        expect(soundMock.instances).toHaveLength(1);
        expect(sound.createdChannels.sort()).toEqual(Object.values(SoundType).sort());
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

        // Both ends have to reach the backend: it is `endTime` *together with* `loop` that makes the
        // node repeat back to `startTime` rather than to zero.
        expect(channel.played[0]).toMatchObject({ startTime: 2, endTime: 30, loop: true });
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
        expect(channel.played[0]).toMatchObject({ startTime: 2, endTime: 30 });
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
