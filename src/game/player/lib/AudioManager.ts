import {Sound} from "@core/elements/sound";
import * as Howler from "howler";
import {FadeOptions} from "@core/elements/type";
import {Awaitable, ChainedAwaitable, ChainedAwaitableTask, SkipController} from "@lib/util/data";
import {GameState} from "@player/gameState";
import {RuntimeGameError} from "@core/common/Utils";

type SoundState = {
    group: Howler.Howl;
    token: number;
};

type SoundTask = {
    awaitable: Awaitable<void>;
};

type SoundDataRaw = {
    isPlaying: boolean;
    position: number;
};

export class AudioManager {
    private state: Map<Sound, SoundState> = new Map();
    private tasks: Map<Howler.Howl, SoundTask> = new Map();

    constructor(private gameState: GameState) {
    }

    public play(sound: Sound, options: FadeOptions = {
        end: 1,
        duration: 0,
    }): Awaitable<void> {
        if (this.state.has(sound)) {
            this.abortTask(this.getState(sound).group);
        }
        const {group, token} = this.initSound(sound);

        this.state.set(sound, {group, token});
        return this.pushTask(group, new ChainedAwaitable()
            .addTask(this.fadeTo(group, token, {
                ...options,
                start: 0,
            }))
            .addTask(this.createTask(() => {
                sound.state.volume = options.end;
                sound.state.paused = false;
            }))
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
            .addTask(this.fadeTo(state.group, state.token, {start: sound.state.volume, end: 0, duration}))
            .addTask(this.createTask(() => {
                state.group.volume(sound.state.volume, state.token);
            }))
            .addTask(this.stopSound(state.group, state.token))
            .run());
    }

    public setVolume(sound: Sound, volume: number, duration: number = 0): Awaitable<void> {
        const state = this.getState(sound);
        this.abortTask(state.group);
        if (duration === 0) {
            state.group.volume(volume, state.token);
            return Awaitable.resolve<void>(undefined);
        }
        return this.pushTask(state.group, new ChainedAwaitable()
            .addTask(this.fadeTo(state.group, state.token, {start: sound.state.volume, end: volume, duration}))
            .addTask(this.createTask(() => {
                sound.state.volume = volume;
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
            .addTask(this.fadeTo(state.group, state.token, {start: sound.state.volume, end: 0, duration}))
            .addTask(this.pauseSound(state.group, state.token))
            .addTask(this.createTask(() => {
                state.group.volume(sound.state.volume, state.token);
                sound.state.paused = true;
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
        return this.pushTask(state.group, new ChainedAwaitable()
            .addTask(this.fadeTo(state.group, state.token, {start: 0, end: sound.state.volume, duration}))
            .addTask(this.resumeSound(state.group, state.token))
            .addTask(this.createTask(() => {
                sound.state.paused = false;
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
        const state = this.getState(sound);
        return state.group.playing(state.token);
    }

    public toData(sound: Sound): SoundDataRaw {
        const state = this.getState(sound);
        return {
            isPlaying: state.group.playing(state.token),
            position: state.group.seek(state.token),
        };
    }

    public fromData(sound: Sound, data: SoundDataRaw): void {
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

    private initSound(sound: Sound): SoundState {
        if (this.state.has(sound)) {
            return this.state.get(sound)!;
        }
        const group = Reflect.construct(this.gameState.getHowl(), [this.getHowlConfig(sound)]);
        const token = group.play();
        this.state.set(sound, {group, token});
        group
            .seek(sound.config.seek, token)
            .volume(sound.state.volume, token)
            .rate(sound.state.rate, token);
        if (sound.state.paused) {
            group.pause(token);
        }
        return {group, token};
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
        let fadeHandler: () => void;

        const start = options.start ?? group.volume();
        const end = options.end ?? group.volume();
        const duration = options.duration;
        const skipController = new SkipController<void>(() => {
            group.volume(end, token);
            group.off("fade", fadeHandler, token);
        });
        const handler = (awaitable: Awaitable<void>) => {
            group.volume(start, token);
            group.fade(start, end, duration, token);
            fadeHandler = () => {
                awaitable.resolve();
            };
            group.once("fade", fadeHandler, token);
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
            preload: sound.config.preload,
            ...options,
        } satisfies Howler.HowlOptions;
    }

    private createTask(handler: () => void): ChainedAwaitableTask {
        return [handler];
    }
}

