import { describe, expect, it, vi, beforeEach } from "vitest";
import { SoundType } from "@core/elements/sound";
import { AudioManager } from "./AudioManager";

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
            const channel = { setVolume: vi.fn() };
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
