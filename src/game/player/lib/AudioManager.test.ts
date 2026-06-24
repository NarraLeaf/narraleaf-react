import { describe, expect, it, vi, beforeEach } from "vitest";
import { SoundType } from "@core/elements/sound";
import { AudioManager } from "./AudioManager";

const soundMock = vi.hoisted(() => ({
    instances: [] as Array<{
        channels: Map<string, { setVolume: ReturnType<typeof vi.fn> }>;
        createdChannels: string[];
        readyResolvers: Array<() => void>;
    }>,
}));

vi.mock("@narraleaf/sound", () => {
    class Sound {
        public channels = new Map<string, { setVolume: ReturnType<typeof vi.fn> }>();
        public createdChannels: string[] = [];
        public readyResolvers: Array<() => void> = [];

        constructor() {
            soundMock.instances.push(this);
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
        },
    } as any;
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
