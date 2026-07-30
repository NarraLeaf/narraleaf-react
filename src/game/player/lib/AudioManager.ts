import { Sound as SoundElement, SoundType } from "@core/elements/sound";
import { Sound as NarraSound, Channel, SoundToken, CachedAudio } from "@narraleaf/sound";
import { FadeOptions } from "@core/elements/type";
import { Awaitable } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { RuntimeGameError } from "@core/common/Utils";
import { LogicAction } from "@core/action/logicAction";

type SoundState = {
    token: SoundToken;
    cachedAudio: CachedAudio;
    originalVolume: number;
    pausePosition?: number; // position (seconds) where playback was paused
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
    private state: Map<SoundElement, SoundState> = new Map();
    private channels: Map<SoundType, Channel> = new Map();
    private channelVolumes: Map<SoundType, number> = new Map();
    private globalVolume: number = 1;
    private sound!: NarraSound; // will be initialized in initialize()
    private ready: Promise<void> = Promise.resolve();
    private isReady: boolean = false;
    private isInitializing: boolean = false;

    constructor(private gameState: GameState) {
        Object.values(SoundType).forEach(type => {
            this.channelVolumes.set(type, 1);
        });
    }

    /**
     * Must be called ONCE on the client side to prepare audio subsystem.
     * Doing it here avoids "AudioContext is not defined" on the server.
     */
    public initialize(): void {
        if (this.isReady || this.isInitializing) return; // already initialised or waiting for unlock

        const sound = new NarraSound();
        this.sound = sound;
        this.isInitializing = true;

        // Wait for audio context to be ready, then create channels
        this.ready = sound.onceReady().then(() => {
            // Apply cached global volume
            sound.setVolume(this.globalVolume);

            // Create channels for each sound type
            Object.values(SoundType).forEach(type => {
                const volume = this.channelVolumes.get(type) ?? 1;
                const channel = sound.getChannel(type) ?? sound.createChannel(type, { volume });
                channel.setVolume(volume);
                this.channels.set(type, channel);
            });
            this.isReady = true;
            this.isInitializing = false;
            // Apply group volumes that may have been set before initialise
            this.setupGroupVolume();
        }).catch(error => {
            this.isInitializing = false;
            this.gameState.logger.error("AudioManager", "Failed to initialize audio subsystem", error);
            throw error;
        });
    }

    public play(sound: SoundElement, options: FadeOptions = {
        end: 1,
        duration: 0,
    }): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        this.ready.then(async () => {
            // Stop existing sound if playing
            if (this.state.has(sound)) {
                const existingState = this.state.get(sound)!;
                existingState.token.stop();
            }

            try {
                const channel = this.channels.get(sound.config.type)!;
                const cachedAudio = await this.sound.load(sound.config.src);
                const token = await channel.play(cachedAudio, {
                    volume: 0,
                    ...AudioManager.clipRegionOf(sound),
                    loop: sound.config.loop,
                    rate: sound.state.rate,
                });

                const isMuted = sound.state.muted ?? false;
                token.mute(isMuted);
                sound.state.muted = isMuted;

                this.state.set(sound, { token, cachedAudio, originalVolume: options.end });

                // Apply fade in
                if (options.duration > 0) {
                    const fadeToken = token.fade(0, options.end, options.duration);
                    await fadeToken.finished;
                } else {
                    token.setVolume(options.end);
                }

                sound.state.volume = options.end;
                sound.state.paused = false;

                // Wait for sound to end (if not looping)
                if (!sound.config.loop) {
                    await new Promise<void>(resolve => {
                        token.once("ended", () => resolve());
                    });
                }

                awaitable.resolve();
            } catch (error) {
                this.gameState.logger.error("AudioManager", `Failed to play sound (src: "${sound.config.src}")`, error);
                awaitable.resolve();
            }
        });

        return awaitable;
    }

    public async playSoundToken(sound: SoundElement, options: FadeOptions = {
        end: 1,
        duration: 0,
    }): Promise<SoundToken> {
        await this.ready;

        // Stop existing sound if playing
        if (this.state.has(sound)) {
            const existingState = this.state.get(sound)!;
            existingState.token.stop();
        }

        try {
            const channel = this.channels.get(sound.config.type);
            if (!channel) {
                throw new RuntimeGameError(`Channel not found for sound type: "${sound.config.type}"`);
            }
            const cachedAudio = await this.sound.load(sound.config.src);
            const token = await channel.play(cachedAudio, {
                volume: 0,
                ...AudioManager.clipRegionOf(sound),
                loop: sound.config.loop,
                rate: sound.state.rate,
            });

            const isMuted = sound.state.muted ?? false;
            token.mute(isMuted);
            sound.state.muted = isMuted;

            this.state.set(sound, { token, cachedAudio, originalVolume: options.end });

            if (options.duration > 0) {
                token.fade(0, options.end, options.duration);
            } else {
                token.setVolume(options.end);
            }

            sound.state.volume = options.end;
            sound.state.paused = false;

            return token;
        } catch (error) {
            this.gameState.logger.error("AudioManager", `Failed to play sound (src: "${sound.config.src}")`, error);
            throw error;
        }
    }

    public stop(sound: SoundElement, duration: number = 0): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        if (!this.state.has(sound)) {
            awaitable.resolve();
            return awaitable;
        }

        const state = this.state.get(sound)!;

        if (duration === 0) {
            state.token.stop();
            this.state.delete(sound);
            awaitable.resolve();
        } else {
            state.token.fade(state.token.getVolume(), 0, duration).finished.then(() => {
                state.token.stop();
                this.state.delete(sound);
                awaitable.resolve();
            });
        }

        return awaitable;
    }

    public setVolume(sound: SoundElement, volume: number, duration: number = 0): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        if (!this.state.has(sound)) {
            awaitable.resolve();
            return awaitable;
        }

        const state = this.state.get(sound)!;
        state.originalVolume = volume;

        if (duration === 0) {
            state.token.setVolume(volume);
            sound.state.volume = volume;
            awaitable.resolve();
        } else {
            state.token.fade(state.token.getVolume(), volume, duration).finished.then(() => {
                sound.state.volume = volume;
                awaitable.resolve();
            });
        }

        return awaitable;
    }

    public mute(sound: SoundElement, muted: boolean = true): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        sound.state.muted = muted;

        if (!this.state.has(sound)) {
            awaitable.resolve();
            return awaitable;
        }

        const state = this.state.get(sound)!;
        state.token.mute(muted);
        awaitable.resolve();
        return awaitable;
    }

    public pause(sound: SoundElement, duration: number = 0): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        if (!this.state.has(sound)) {
            awaitable.resolve();
            return awaitable;
        }

        const state = this.state.get(sound)!;

        if (duration === 0) {
            // Record pause position before pausing so that resume can be sample-accurate
            state.pausePosition = state.token.getCurrentTime();
            state.token.pause();
            sound.state.paused = true;
            awaitable.resolve();
        } else {
            state.token.fade(state.token.getVolume(), 0, duration).finished.then(() => {
                state.pausePosition = state.token.getCurrentTime();
                state.token.pause();
                state.token.setVolume(state.originalVolume);
                sound.state.paused = true;
                awaitable.resolve();
            });
        }

        return awaitable;
    }

    public resume(sound: SoundElement, duration: number = 0): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        if (!this.state.has(sound)) {
            awaitable.resolve();
            return awaitable;
        }

        const state = this.state.get(sound)!;

        if (duration === 0) {
            // If we have an accurate pause position saved, seek first to eliminate drift
            if (state.pausePosition !== undefined) {
                state.token.seek(state.pausePosition);
            }
            state.token.resume();
            sound.state.paused = false;
            awaitable.resolve();
        } else {
            state.token.setVolume(0);
            // Ensure drift-free resume by seeking to stored position if available
            if (state.pausePosition !== undefined) {
                state.token.seek(state.pausePosition);
            }
            state.token.resume();
            state.token.fade(0, state.originalVolume, duration).finished.then(() => {
                sound.state.paused = false;
                awaitable.resolve();
            });
        }

        return awaitable;
    }

    /**
     * Move the play head of a sound that is currently playing. A sound this manager is not holding
     * has no play head to move, so this is a no-op rather than an error - the same shape every other
     * transport method here takes.
     */
    public seek(sound: SoundElement, time: number): Awaitable<void> {
        if (!this.state.has(sound)) {
            return Awaitable.resolve<void>(undefined);
        }
        const state = this.state.get(sound)!;
        const target = AudioManager.clampToRegion(time, AudioManager.clipRegionOf(sound));
        state.token.seek(target);
        // Resuming seeks to this to eliminate drift, so a stale value here would make a seek taken
        // while paused snap straight back on resume.
        if (state.pausePosition !== undefined) {
            state.pausePosition = target;
        }
        return Awaitable.resolve<void>(undefined);
    }

    /**
     * The in/out points of a clip as the sound backend's play options.
     *
     * `endTime` is left off entirely when the author set none: passing `undefined` explicitly is the
     * same thing to the backend, but omitting it keeps `{...region}` spreads from writing a key that
     * reads as "there is a region here" to anything inspecting the object.
     */
    private static clipRegionOf(sound: SoundElement): { startTime: number; endTime?: number } {
        const startTime = sound.config.seek;
        const endTime = sound.config.endTime;
        if (endTime === undefined || !Number.isFinite(endTime) || endTime <= startTime) {
            return { startTime };
        }
        return { startTime, endTime };
    }

    private static clampToRegion(time: number, region: { startTime: number; endTime?: number }): number {
        const floor = Math.max(0, time);
        if (region.endTime === undefined) {
            return floor;
        }
        return floor >= region.endTime ? region.startTime : floor;
    }

    public setRate(sound: SoundElement, rate: number): Awaitable<void> {
        if (!this.state.has(sound)) {
            return Awaitable.resolve<void>(undefined);
        }

        const state = this.state.get(sound)!;
        state.token.setRate(rate);
        sound.state.rate = rate;
        return Awaitable.resolve<void>(undefined);
    }

    public getPosition(sound: SoundElement): number {
        if (!this.state.has(sound)) {
            return 0;
        }
        const state = this.state.get(sound)!;
        return state.token.getCurrentTime();
    }

    public isPlaying(sound: SoundElement): boolean {
        if (!this.isManaged(sound)) {
            return false;
        }
        const state = this.state.get(sound)!;
        return state.token.isPlaying();
    }

    public getToken(sound: SoundElement): SoundToken | null {
        return this.state.get(sound)?.token ?? null;
    }

    public toData(): AudioManagerDataRaw {
        return {
            sounds: [...this.state.entries()].map(([sound, state]) => [
                sound.getId(),
                {
                    isPlaying: state.token.isPlaying(),
                    position: state.token.getCurrentTime(),
                }
            ]),
            groups: [...this.channelVolumes.entries()].map(([type, volume]) => [type, volume])
        };
    }

    public fromData(data: AudioManagerDataRaw, elementMap: Map<string, LogicAction.GameElement>): this {
        data.groups?.forEach(([type, volume]) => {
            this.setGroupVolume(type, volume);
        });

        data.sounds.forEach(([soundId, soundData]) => {
            const sound = elementMap.get(soundId) as SoundElement;
            if (!sound) {
                throw new RuntimeGameError(`Sound not found (id: "${soundId}")`
                    + "\nNarraLeaf cannot find the element with the id from the saved game");
            }
            this.soundFromData(sound, soundData);
        });
        return this;
    }

    public soundFromData(sound: SoundElement, data: AudioDataRaw): void {
        // Stop existing sound if any
        if (this.state.has(sound)) {
            const existingState = this.state.get(sound)!;
            existingState.token.stop();
        }

        this.ready.then(async () => {
            try {
                const channel = this.channels.get(sound.config.type)!;
                const cachedAudio = await this.sound.load(sound.config.src);
                const region = AudioManager.clipRegionOf(sound);
                // A clip with a loop region has to start at its in point even when we are restoring
                // a save from halfway through: the region's start is also the point each repeat
                // returns to, so starting at `position` would move the loop for the rest of the
                // session. Start where the region says and seek forward - the jump preserves the
                // loop (it rebuilds the source node with loopStart/loopEnd intact).
                const anchored = region.endTime !== undefined && sound.config.loop;
                const token = await channel.play(cachedAudio, {
                    volume: sound.state.volume,
                    ...region,
                    startTime: anchored ? region.startTime : data.position,
                    loop: sound.config.loop,
                    rate: sound.state.rate,
                });
                if (anchored && Math.abs(data.position - region.startTime) > 0.01) {
                    token.seek(AudioManager.clampToRegion(data.position, region));
                }

                this.state.set(sound, { token, cachedAudio, originalVolume: sound.state.volume });
                const isMuted = sound.state.muted ?? false;
                token.mute(isMuted);
                sound.state.muted = isMuted;

                if (sound.state.paused) {
                    token.pause();
                } else if (!data.isPlaying) {
                    token.stop();
                }
            } catch (error) {
                this.gameState.logger.error("AudioManager", `Failed to restore sound (src: "${sound.config.src}")`, error);
            }
        });
    }

    public isManaged(sound: SoundElement): boolean {
        return this.state.has(sound);
    }

    /**
     * Fetch and decode a sound into the audio cache without playing it, so the first `play()` of
     * this source starts on the same frame it is asked to instead of after a fetch and a decode.
     *
     * Deliberately **not** something to gate a loading screen on: the audio context only becomes
     * ready once the browser's autoplay policy is satisfied by a user gesture, so this can sit
     * pending indefinitely on a page nobody has interacted with yet. Start it and let it land —
     * in practice the gesture that opens a menu unlocks the context long before the scene it
     * belongs to is entered. Failures resolve quietly; the sound then loads on first play, exactly
     * as it did before.
     */
    public preload(sound: SoundElement): Promise<void> {
        return this.ready
            .then(() => this.sound.load(sound.config.src))
            .then(() => void 0)
            .catch((error) => {
                this.gameState.logger.weakWarn(
                    "AudioManager",
                    `Failed to preload sound (src: "${sound.config.src}")`,
                    error,
                );
            });
    }

    public reset(): void {
        this.state.forEach((state) => {
            state.token.stop();
        });
        this.state.clear();

        // Reset global volume to 1
        this.globalVolume = 1;
        if (this.isReady) {
            this.sound.setVolume(1);
        }

        // Reset channel volumes to 1
        Object.values(SoundType).forEach(type => {
            this.channelVolumes.set(type, 1);
            if (this.isReady) {
                const channel = this.channels.get(type);
                if (channel) {
                    channel.setVolume(1);
                }
            }
        });
        this.setupGroupVolume();
    }

    public setGroupVolume(type: SoundType, volume: number): void {
        // Always store the volume
        this.channelVolumes.set(type, volume);

        // If ready, also apply to the channel
        if (this.isReady) {
            const channel = this.channels.get(type);
            if (channel) {
                channel.setVolume(volume);
            }
        }
    }

    public setGlobalVolume(volume: number): void {
        this.globalVolume = volume;
        if (this.isReady) {
            this.sound.setVolume(volume);
        }
    }

    public getGlobalVolume(): number {
        return this.globalVolume;
    }

    public getGroupVolume(type: SoundType): number {
        return this.channelVolumes.get(type) ?? 1;
    }

    public destroy(): void {
        this.reset();
        this.sound.destroy();
    }

    private setupGroupVolume(): void {
        const {soundVolume, bgmVolume, voiceVolume} = this.gameState.game.preference.getPreferences();
        this.setGroupVolume(SoundType.Sound, soundVolume);
        this.setGroupVolume(SoundType.Bgm, bgmVolume);
        this.setGroupVolume(SoundType.Voice, voiceVolume);
    }
}
