import { Sound, SoundType } from "@core/elements/sound";
import * as Howler from "howler";
import { FadeOptions } from "@core/elements/type";
import { Awaitable, ChainedAwaitable, ChainedAwaitableTask, SkipController } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { RuntimeGameError } from "@core/common/Utils";
import { LogicAction } from "@core/action/logicAction";

type SoundState = {
    group: Howler.Howl;
    token: number;
    originalVolume: number;
};

type SoundTask = {
    awaitable: Awaitable<void>;
};

type SoundGroup = {
    volume: number;
    sounds: Set<Sound>;
};

export type AudioDataRaw = {
    isPlaying: boolean;
    position: number;
};

export type AudioManagerDataRaw = {
    sounds: [string, AudioDataRaw][];
    groups: [SoundType, number][];
};

export class AudioManager {
    private state: Map<Sound, SoundState> = new Map();
    private tasks: Map<Howler.Howl, SoundTask> = new Map();
    private groups: Map<SoundType, SoundGroup> = new Map();

    constructor(private gameState: GameState) {
        Object.values(SoundType).forEach(type => {
            this.groups.set(type, { volume: 1, sounds: new Set() });
        });
        this.setupGroupVolume();
    }

    public play(sound: Sound, options: FadeOptions = {
        end: 1,
        duration: 0,
    }): Awaitable<void> {
        if (this.state.has(sound)) {
            this.abortTask(this.getState(sound).group);
        }
        const { group, token, onPlayTask, onEndTask } = this.initSound(sound);

        const groupVolume = this.groups.get(sound.config.type)?.volume ?? 1;
        const effectiveVolume = options.end * groupVolume;

        this.state.set(sound, { group, token, originalVolume: options.end });
        return this.pushTask(group, new ChainedAwaitable()
            .addTask(onPlayTask)
            .addTask(this.fadeTo(group, token, {
                ...options,
                start: 0,
                end: effectiveVolume,
            }))
            .addTask(this.createTask((resolve) => {
                sound.state.volume = options.end;
                sound.state.paused = false;
                resolve();
            }))
            .addTask(onEndTask)
            .run());
    }

    public stop(sound: Sound, duration: number = 0): Awaitable<void> {
        const state = this.getState(sound);
        this.abortTask(state.group);
        if (duration === 0) {
            state.group.stop(state.token);
            return Awaitable.resolve<void>(undefined);
        }
        return this.pushTask(state.group, new ChainedAwaitable()
            .addTask(this.fadeTo(state.group, state.token, { start: sound.state.volume, end: 0, duration }))
            .addTask(this.createTask((resolve) => {
                state.group.volume(sound.state.volume, state.token);
                resolve();
            }))
            .addTask(this.stopSound(state.group, state.token))
            .run());
    }

    public setVolume(sound: Sound, volume: number, duration: number = 0): Awaitable<void> {
        const state = this.getState(sound);
        this.abortTask(state.group);

        // Store the original volume and calculate effective volume
        state.originalVolume = volume;
        const groupVolume = this.groups.get(sound.config.type)?.volume ?? 1;
        const effectiveVolume = volume * groupVolume;

        if (duration === 0) {
            state.group.volume(effectiveVolume, state.token);
            return Awaitable.resolve<void>(undefined);
        }
        return this.pushTask(state.group, new ChainedAwaitable()
            .addTask(this.fadeTo(state.group, state.token, { start: sound.state.volume, end: effectiveVolume, duration }))
            .addTask(this.createTask((resolve) => {
                sound.state.volume = volume;
                resolve();
            }))
            .run());
    }

    public pause(sound: Sound, duration: number = 0): Awaitable<void> {
        const state = this.getState(sound);
        this.abortTask(state.group);
        if (duration === 0) {
            state.group.pause(state.token);
            return Awaitable.resolve<void>(undefined);
        }
        return this.pushTask(state.group, new ChainedAwaitable()
            .addTask(this.fadeTo(state.group, state.token, { start: sound.state.volume, end: 0, duration }))
            .addTask(this.pauseSound(state.group, state.token))
            .addTask(this.createTask((resolve) => {
                this.applyEffectiveVolume(sound);
                sound.state.paused = true;
                resolve();
            }))
            .run());
    }

    public resume(sound: Sound, duration: number = 0): Awaitable<void> {
        const state = this.getState(sound);
        this.abortTask(state.group);
        if (duration === 0) {
            state.group.play(state.token);
            return Awaitable.resolve<void>(undefined);
        }
        const groupVolume = this.groups.get(sound.config.type)?.volume ?? 1;
        const effectiveVolume = state.originalVolume * groupVolume;
        return this.pushTask(state.group, new ChainedAwaitable()
            .addTask(this.fadeTo(state.group, state.token, { start: 0, end: effectiveVolume, duration }))
            .addTask(this.resumeSound(state.group, state.token))
            .addTask(this.createTask((resolve) => {
                sound.state.paused = false;
                resolve();
            }))
            .run());
    }

    public setRate(sound: Sound, rate: number): Awaitable<void> {
        const state = this.getState(sound);
        this.abortTask(state.group);
        state.group.rate(rate, state.token);
        sound.state.rate = rate;
        return Awaitable.resolve<void>(undefined);
    }

    public getPosition(sound: Sound): number {
        const state = this.getState(sound);
        return state.group.seek(state.token);
    }

    public isPlaying(sound: Sound): boolean {
        if (!this.isManaged(sound)) {
            return false;
        }
        const state = this.getState(sound);
        return state.group.playing(state.token);
    }

    public toData(): AudioManagerDataRaw {
        return {
            sounds: [...this.state.entries()].map(([sound, state]) => [
                sound.getId(),
                {
                    isPlaying: state.group.playing(state.token),
                    position: state.group.seek(state.token),
                }
            ]),
            groups: [...this.groups.entries()].map(([type, group]) => [type, group.volume])
        };
    }

    public fromData(data: AudioManagerDataRaw, elementMap: Map<string, LogicAction.GameElement>): this {
        data.groups?.forEach(([type, volume]) => {
            const group = this.groups.get(type);
            if (group) {
                group.volume = volume;
                // Update volume for all sounds in the group
                group.sounds.forEach(sound => {
                    this.applyEffectiveVolume(sound);
                });
            }
        });

        data.sounds.forEach(([soundId, soundData]) => {
            const sound = elementMap.get(soundId) as Sound;
            if (!sound) {
                throw new RuntimeGameError(`Sound not found (id: "${soundId}")`
                    + "\nNarraLeaf cannot find the element with the id from the saved game");
            }
            this.soundFromData(sound, soundData);
        });
        return this;
    }

    public soundFromData(sound: Sound, data: AudioDataRaw): void {
        const lastState = this.getState(sound);
        if (lastState.group.playing(lastState.token)) {
            lastState.group.stop(lastState.token);
        }

        const state = this.initSound(sound);
        this.state.set(sound, state);
        state.group.seek(data.position, state.token);
        if (sound.state.paused) {
            state.group.pause(state.token);
        } else if (!data.isPlaying) {
            state.group.stop(state.token);
        }
    }

    public isManaged(sound: Sound): boolean {
        return this.state.has(sound);
    }

    public reset(): void {
        this.state.forEach((state) => {
            state.group.stop(state.token);
        });
        this.state.clear();
        this.tasks.forEach((task) => {
            task.awaitable.abort();
        });
        this.tasks.clear();

        // Reset group volumes to 1 and clear sound sets
        this.groups.forEach(group => {
            group.volume = 1;
            group.sounds.clear();
        });
        this.setupGroupVolume();
    }

    public setGroupVolume(type: SoundType, volume: number): void {
        const group = this.groups.get(type);
        if (!group) {
            throw new RuntimeGameError(`Sound group not found (type: "${type}")`);
        }

        group.volume = volume;

        // Update volume for all sounds in the group by applying the group volume
        group.sounds.forEach(sound => {
            this.applyEffectiveVolume(sound);
        });
    }

    public setGlobalVolume(volume: number): void {
        Howler.Howler.volume(volume);
    }

    public getGlobalVolume(): number {
        return Howler.Howler.volume();
    }

    public getGroupVolume(type: SoundType): number {
        return this.groups.get(type)?.volume ?? 1;
    }

    private setupGroupVolume(): void {
        const {soundVolume, bgmVolume, voiceVolume} = this.gameState.game.preference.getPreferences();
        this.setGroupVolume(SoundType.Sound, soundVolume);
        this.setGroupVolume(SoundType.Bgm, bgmVolume);
        this.setGroupVolume(SoundType.Voice, voiceVolume);
    }

    private initSound(sound: Sound): SoundState & {
        onPlayTask?: ChainedAwaitableTask;
        onEndTask?: ChainedAwaitableTask;
    } {
        if (this.state.has(sound)) {
            return this.state.get(sound)!;
        }

        // Add sound to its type group
        const group = this.groups.get(sound.config.type);
        if (group) {
            group.sounds.add(sound);
        }

        const audioManager = this;
        const [onPlay, onPlayTask] = this.wrapTask();
        const [onEnd, onEndTask] = this.wrapTask();
        const groupVolume = this.groups.get(sound.config.type)?.volume ?? 1;
        const effectiveVolume = sound.state.volume * groupVolume;

        const howlGroup = Reflect.construct(this.gameState.getHowl(), [this.getHowlConfig(sound, {
            volume: effectiveVolume,
            onend() {
                onEnd.resolve();
            },
            onplay() {
                onPlay.resolve();
            },
            onloaderror(_, error: unknown) {
                const code = error as 1 | 2 | 3 | 4;
                const messages: {
                    [K in 1 | 2 | 3 | 4]: string;
                } = {
                    1: "The fetching process for the media resource was aborted by the user agent at the user's request.",
                    2: "A network error of some description caused the user agent to stop fetching the media resource, after the resource was established to be usable.",
                    3: "An error of some description occurred while decoding the media resource, after the resource was established to be usable.",
                    4: "The media resource indicated by the src attribute or assigned media provider object was not suitable.",
                };
                audioManager.gameState.logger.error("AudioManager", `Failed to load sound (src: "${sound.config.src}")`
                    + ` \n${messages[code]}`
                    + " \nFor more information, see https://github.com/goldfire/howler.js?tab=readme-ov-file#onloaderror-function");
            }
        })]);
        const token = howlGroup.play();
        const state = { group: howlGroup, token, originalVolume: sound.state.volume };
        this.state.set(sound, state);

        // Set initial volume and update sound state
        howlGroup
            .seek(sound.config.seek, token)
            .rate(sound.state.rate, token);

        if (sound.state.paused) {
            howlGroup.pause(token);
        }
        return { ...state, onPlayTask, onEndTask };
    }

    private pushTask(spirit: Howler.Howl, awaitable: Awaitable<void>): Awaitable<void> {
        this.tasks.set(spirit, {
            awaitable,
        });
        return awaitable;
    }

    private getState(sound: Sound): SoundState {
        if (!this.state.has(sound)) {
            throw new RuntimeGameError(`Sound not initialized (src: "${sound.config.src}")`);
        }
        return this.state.get(sound)!;
    }

    private abortTask(group: Howler.Howl): void {
        const task = this.tasks.get(group);
        if (task) {
            task.awaitable.abort();
            this.tasks.delete(group);
        }
    }

    private fadeTo(group: Howler.Howl, token: number, options: FadeOptions): ChainedAwaitableTask {
        let fadeHandler: () => void, schedule: VoidFunction | undefined;

        const start = options.start ?? group.volume();
        const end = options.end ?? group.volume();
        const duration = options.duration;
        const skipController = new SkipController<void>(() => {
            group.volume(end, token);
            fadeHandler();
        });
        const handler = (awaitable: Awaitable<void>) => {
            group.volume(start, token);
            group.fade(start, end, duration, token);
            fadeHandler = () => {
                if (awaitable.isSolved()) {
                    return;
                }
                if (schedule) {
                    schedule();
                    schedule = undefined;
                }
                awaitable.resolve();
            };
            schedule = this.gameState.schedule(() => {
                schedule = undefined;
                fadeHandler();
            }, duration);
        };
        return [handler, skipController];
    }

    private stopSound(group: Howler.Howl, token: number): ChainedAwaitableTask {
        return [() => {
            group.stop(token);
        }];
    }

    private pauseSound(group: Howler.Howl, token: number): ChainedAwaitableTask {
        return [() => {
            group.pause(token);
        }];
    }

    private resumeSound(group: Howler.Howl, token: number): ChainedAwaitableTask {
        return [() => {
            group.play(token);
        }];
    }

    private getHowlConfig(sound: Sound, options: Partial<Howler.HowlOptions> = {}): Howler.HowlOptions {
        return {
            src: sound.config.src,
            volume: sound.state.volume,
            loop: sound.config.loop,
            rate: sound.state.rate,
            html5: sound.config.streaming,
            ...options,
        } satisfies Howler.HowlOptions;
    }

    private createTask(handler: (resolve: () => void) => void): ChainedAwaitableTask {
        return [(awaitable) => {
            handler(awaitable.resolve.bind(awaitable));
        }];
    }

    private wrapTask(): [awaitable: Awaitable<void>, task: ChainedAwaitableTask] {
        const awaitable = new Awaitable<void>();
        return [awaitable, [(a) => {
            if (awaitable.isSolved()) {
                a.resolve();
            } else {
                awaitable.then(() => {
                    a.resolve();
                });
            }
        }]];
    }

    private applyEffectiveVolume(sound: Sound): void {
        if (!this.isManaged(sound)) return;
        const state = this.getState(sound);
        const groupVolume = this.groups.get(sound.config.type)?.volume ?? 1;
        const effectiveVolume = state.originalVolume * groupVolume;
        state.group.volume(effectiveVolume, state.token);
    }
}

