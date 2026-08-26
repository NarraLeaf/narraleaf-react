import { Sound as SoundElement, SoundBusId } from "@core/elements/sound";
import { Sound as NarraSound, Channel, SoundToken, CachedAudio } from "@narraleaf/sound";
import { FadeOptions } from "@core/elements/type";
import { Awaitable, EventToken } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { RuntimeGameError } from "@core/common/Utils";
import { LogicAction } from "@core/action/logicAction";
import { AudioBusMixer, AudioBusState, AudioBusTree, DefaultAudioBusIds } from "@core/game/audioBus";

/**
 * The in/out points of a clip, plus the point each repeat returns to.
 *
 * `loopStart` is only ever consulted for a looping clip; `endTime` is what makes the pair a region
 * at all, so both of the other two are meaningless without it.
 */
type ClipRegion = {
    startTime: number;
    endTime?: number;
    loopStart?: number;
};

type SoundState = {
    token: SoundToken;
    cachedAudio: CachedAudio;
    originalVolume: number;
    pausePosition?: number; // position (seconds) where playback was paused
};

export type AudioDataRaw = {
    isPlaying: boolean;
    position: number;
    /**
     * The clip is paused rather than stopped: it is off, and it is expected to be picked up again
     * from `position`.
     *
     * On the record rather than left to the sound element's own state, because a sound only reaches
     * a save through the element table when something has marked it dirty AND its state differs
     * from what the script authored - and a scene's background music is not any action's callee, so
     * it is routinely absent from that table. This record is written for every clip the manager is
     * holding, so it is the one place that can speak for a paused one.
     *
     * Absent in saves written before scene calls existed, where it reads as the element's own state
     * exactly as it did then.
     */
    paused?: boolean;
};

export type AudioManagerDataRaw = {
    sounds: [string, AudioDataRaw][];
    /**
     * Bus volumes, keyed by bus id.
     *
     * The name is historical - these used to be the three fixed "groups". A save written before
     * buses existed carries exactly `bgm`/`sound`/`voice`, which are still buses, so it restores
     * unchanged.
     */
    groups: [string, number][];
};

export class AudioManager {
    /**
     * How much of the backend's channel budget to ask for.
     *
     * `@narraleaf/sound` defaults to 128 *including* the master, and throws outright when a
     * `createChannel` would cross it. Three buses never came close; a game that gives every member
     * of a large voiced cast its own bus can, and the failure mode is a hard throw at boot. This is
     * a per-channel `GainNode` and nothing else, so a generous ceiling costs effectively nothing.
     */
    private static readonly MaxChannels = 1024;

    /**
     * Time constant of the bus-volume ramp, in seconds. ~20ms: long enough to turn a step into a
     * slew nobody hears, short enough that a slider still feels attached to the sound.
     */
    private static readonly BusRampTimeConstant = 0.02;

    /**
     * When to pin the exact target after the ramp. `setTargetAtTime` approaches asymptotically and
     * never lands, so five time constants in (within 0.7% - inaudible) the value is written
     * outright. Without this a long drag would accumulate a drift the mixer's own bookkeeping does
     * not have.
     */
    private static readonly BusRampSettle = AudioManager.BusRampTimeConstant * 5;

    private state: Map<SoundElement, SoundState> = new Map();
    private channels: Map<string, Channel> = new Map();
    private busTree: AudioBusTree | null = null;
    private busSubscription: EventToken | null = null;
    private unknownBuses: Set<string> = new Set();
    private globalVolume: number = 1;
    private sound!: NarraSound; // will be initialized in initialize()
    private ready: Promise<void> = Promise.resolve();
    private isReady: boolean = false;
    private isInitializing: boolean = false;

    constructor(private gameState: GameState) {
    }

    /**
     * The volume of every bus, and the tree they are wired into.
     *
     * It lives on `Game`, not here: a bus volume is a player setting that exists before the audio
     * context unlocks and outlives any one player mount. This manager is the thing that makes it
     * audible, not the thing that remembers it.
     */
    private get mixer(): AudioBusMixer {
        return this.gameState.game.audioBuses;
    }

    /**
     * Must be called ONCE on the client side to prepare audio subsystem.
     * Doing it here avoids "AudioContext is not defined" on the server.
     */
    public initialize(): void {
        if (this.isReady || this.isInitializing) return; // already initialised or waiting for unlock

        // Resolve - and therefore validate - the declared tree *synchronously*, before anything
        // async is set up. A cycle or an unknown parent is a fault in the host's config, and it has
        // to surface as a throw out of this call at the point the player mounts. Left inside the
        // `onceReady` chain below it would arrive later, as an unhandled rejection, with the game
        // apparently just having no sound.
        this.mixer.getTree();

        const sound = new NarraSound({ maxChannels: AudioManager.MaxChannels });
        this.sound = sound;
        this.isInitializing = true;

        // Wait for audio context to be ready, then build the declared bus tree
        this.ready = sound.onceReady().then(() => {
            // Apply cached global volume
            sound.setVolume(this.globalVolume);

            this.realizeBusTree(sound);
            this.isReady = true;
            this.isInitializing = false;
        }).catch(error => {
            this.isInitializing = false;
            this.gameState.logger.error("AudioManager", "Failed to initialize audio subsystem", error);
            throw error;
        });
    }

    /**
     * Build the host's declared bus tree into real channels, once.
     *
     * Walked front to back the tree hands every bus out after its parent, so a child always has a
     * live parent channel to be created from - that is what nests the gain nodes, and cascading
     * gain then falls out of the audio graph rather than out of any arithmetic here.
     *
     * Done once, at boot, and never re-shaped: `Channel.remove()` stops every token in its subtree,
     * so re-parenting a bus while the game runs would cut the music off. Volumes stay live.
     */
    private realizeBusTree(sound: NarraSound): void {
        const tree = this.mixer.getTree();
        this.busTree = tree;
        this.channels.clear();

        tree.getNodes().forEach(node => {
            // The author's declared mix times whatever the player has done to it - the two are
            // separate numbers precisely so that neither this nor `setupGroupVolume` below can
            // erase the other.
            const volume = this.mixer.getEffectiveVolume(node.id);
            const parent = node.parentId === null ? null : this.channels.get(node.parentId) ?? null;
            const existing = parent ? parent.getChannel(node.id) : sound.getChannel(node.id);
            const channel = existing ?? (parent
                ? parent.createChannel(node.id, { volume })
                : sound.createChannel(node.id, { volume }));
            // No ramp at boot: nothing is playing, and a ramp would only delay the first clip
            // reaching the volume the player left it at.
            this.applyBusVolume(channel, volume, false);
            this.channels.set(node.id, channel);
        });

        this.busSubscription?.cancel();
        this.busSubscription = this.mixer.onVolumeChange((id, _volume, effectiveVolume) => {
            this.applyBusVolume(this.channels.get(id) ?? null, effectiveVolume, true);
        });
    }

    /**
     * Write a bus's volume onto its gain node, ramping rather than stepping.
     *
     * `Channel.setVolume` assigns `gain.value` bare with no `cancelScheduledValues`, so a slider
     * drag arrives as a staircase of discontinuities - the zipper. The backend exposes no ramping
     * setter, only `getGainNode()`, so the ramp is driven from here.
     *
     * **Who owns the value.** `Channel.volume` remains authoritative bookkeeping and the
     * `AudioParam` is authoritative for what is heard, and this method is the only writer of
     * either, so the two can only disagree for the ~20ms a ramp is in flight. `channel.setVolume`
     * is still called first and deliberately: it is what clamps to 0..1, what keeps
     * `channel.getVolume()` truthful, and what `Channel.mute()`/`unmute()` re-read when they
     * rewrite the gain themselves. Its bare write is then superseded in the same synchronous turn -
     * `cancelScheduledValues` drops the implicit `setValueAtTime` that the assignment inserted at
     * `currentTime`, and the ramp is scheduled from the value the parameter actually had. Nothing
     * else in the engine touches a bus gain node, so there is no other automation to fight.
     *
     * Falls back to the plain assignment whenever the graph is not reachable - a backend without
     * `getGainNode`, or a parameter without `setTargetAtTime`. Stepping is the behaviour that
     * shipped; degrading to it is strictly no worse.
     */
    private applyBusVolume(channel: Channel | null | undefined, volume: number, ramp: boolean): void {
        if (!channel) {
            return;
        }
        const from = AudioManager.readGain(channel);
        channel.setVolume(volume);
        if (!ramp || from === null) {
            return;
        }

        const gain = channel.getGainNode().gain;
        const target = channel.getVolume();
        if (typeof gain.setTargetAtTime !== "function"
            || typeof gain.cancelScheduledValues !== "function"
            || typeof this.sound?.getAudioContext !== "function") {
            return;
        }
        const now = this.sound.getAudioContext().currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(from, now);
        gain.setTargetAtTime(target, now, AudioManager.BusRampTimeConstant);
        gain.setValueAtTime(target, now + AudioManager.BusRampSettle);
    }

    /**
     * The value a bus's gain parameter has right now, or `null` when the graph cannot be reached.
     */
    private static readGain(channel: Channel): number | null {
        if (typeof channel.getGainNode !== "function") {
            return null;
        }
        const gain = channel.getGainNode()?.gain;
        return typeof gain?.value === "number" ? gain.value : null;
    }

    /**
     * The channel a clip plays through.
     *
     * A bus id nothing declared is not fatal. Refusing to play would turn one typo in one clip's
     * `type` into silence or a thrown action mid-scene; routing it to the always-seeded sfx bus
     * keeps the game audible and says so once, per id, in the log. This is also where a bus name
     * that {@link import("@core/game/audioBus").acceptsAudioBus} let through at story-build time is
     * finally caught.
     */
    private channelFor(sound: SoundElement): Channel | null {
        const channel = this.channels.get(sound.config.type);
        if (channel) {
            return channel;
        }
        if (this.channels.size > 0 && !this.unknownBuses.has(sound.config.type)) {
            this.unknownBuses.add(sound.config.type);
            this.gameState.logger.weakWarn(
                "AudioManager",
                `No audio bus "${sound.config.type}" is declared; playing on "${DefaultAudioBusIds.sound}" instead.`,
            );
        }
        return this.channels.get(DefaultAudioBusIds.sound) ?? null;
    }

    /**
     * The volume a clip started with no explicit target should reach.
     *
     * Full volume was never a sensible default here: a `Sound` carries the volume it was configured
     * with, so a caller that says nothing about volume is asking for *that*, not for 1. Reading
     * `state` rather than the user config is deliberate - it is the same value {@link SoundElement.play}
     * and {@link SoundElement.resume} put in their `FadeOptions`, so a clip replayed after
     * {@link AudioManager.setVolume} comes back at the volume it was last set to instead of jumping
     * back to whatever the author first wrote down.
     */
    private static defaultFade(sound: SoundElement): FadeOptions {
        return { end: sound.state.volume, duration: 0 };
    }

    public play(sound: SoundElement, options: FadeOptions = AudioManager.defaultFade(sound)): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        this.ready.then(async () => {
            // Stop existing sound if playing
            if (this.state.has(sound)) {
                const existingState = this.state.get(sound)!;
                existingState.token.stop();
            }

            try {
                const channel = this.channelFor(sound)!;
                const cachedAudio = await this.sound.load(sound.config.src);
                const region = AudioManager.clipRegionOf(sound);
                const token = await channel.play(cachedAudio, {
                    volume: 0,
                    ...AudioManager.playRegionOf(region, sound.config.loop),
                    loop: sound.config.loop,
                    rate: sound.state.rate,
                });
                if (sound.config.loop) {
                    AudioManager.applyLoopRegion(token, region);
                }

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

    /**
     * Start a clip and hand the token back once playback is under way.
     *
     * With no `duration` the target volume is written to the token *synchronously* before this
     * returns, and nothing is left running: no gain automation is in flight when the caller gets the
     * token. That is what makes an explicit `token.setVolume` or a fade the caller drives itself
     * afterwards the last writer, which several hosts rely on. Defaulting `duration` to anything
     * above 0 would break that - `token.fade` below is deliberately not awaited, so a non-zero
     * default would leave a ramp running past the return and over whatever the caller did next.
     */
    public async playSoundToken(
        sound: SoundElement,
        options: FadeOptions = AudioManager.defaultFade(sound),
    ): Promise<SoundToken> {
        await this.ready;

        // Stop existing sound if playing
        if (this.state.has(sound)) {
            const existingState = this.state.get(sound)!;
            existingState.token.stop();
        }

        try {
            const channel = this.channelFor(sound);
            if (!channel) {
                throw new RuntimeGameError(`Channel not found for audio bus: "${sound.config.type}"`);
            }
            const cachedAudio = await this.sound.load(sound.config.src);
            const region = AudioManager.clipRegionOf(sound);
            const token = await channel.play(cachedAudio, {
                volume: 0,
                ...AudioManager.playRegionOf(region, sound.config.loop),
                loop: sound.config.loop,
                rate: sound.state.rate,
            });
            if (sound.config.loop) {
                AudioManager.applyLoopRegion(token, region);
            }

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
        // `paused` is part of the sound's serialised state, and nothing here goes through the
        // action dispatch that marks an element for the next save. A scene call pauses the calling
        // scene's music from a scene action, so without this the save would come back with the
        // suspended scene's track playing.
        sound.markDirty();

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
        sound.markDirty();

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
     * The in/out points of a clip.
     *
     * `endTime` is left off entirely when the author set none: passing `undefined` explicitly is the
     * same thing to the backend, but omitting it keeps `{...region}` spreads from writing a key that
     * reads as "there is a region here" to anything inspecting the object.
     */
    private static clipRegionOf(sound: SoundElement): ClipRegion {
        const startTime = sound.config.seek;
        const endTime = sound.config.endTime;
        if (endTime === undefined || !Number.isFinite(endTime) || endTime <= startTime) {
            return { startTime };
        }
        const loopStart = sound.config.loopStart;
        if (loopStart === undefined || !Number.isFinite(loopStart)) {
            return { startTime, endTime };
        }
        return { startTime, endTime, loopStart };
    }

    /**
     * The region as the sound backend's play options.
     *
     * A looping clip deliberately hands over **no** `endTime`. The backend turns `endTime` into a
     * timer that stops the token after one pass, whether or not the clip loops, so passing it here
     * is what kept the loop region from ever repeating. The region reaches a looping clip through
     * {@link AudioManager.applyLoopRegion} instead; for a one-shot `endTime` *is* the out point and
     * the backend's timer is exactly the right mechanism.
     */
    private static playRegionOf(region: ClipRegion, loop: boolean): { startTime: number; endTime?: number } {
        if (loop || region.endTime === undefined) {
            return { startTime: region.startTime };
        }
        return { startTime: region.startTime, endTime: region.endTime };
    }

    /**
     * Write a looping clip's region onto the Web Audio node the backend is playing it through.
     *
     * **This is a shim against `@narraleaf/sound@0.1.0`'s internals, and the only place in this
     * repo that reaches into them.** Two things in that version make the region unusable from the
     * outside:
     *
     * - `SoundToken`'s constructor arms `setTimeout(stop, duration * 1000)` whenever a duration was
     *   given, without consulting `loop` — so a looping clip with an out point hard-stops after its
     *   first pass through the region.
     * - `Sound.createToken` pins `loopStart` to the playback start offset, so "play the intro from
     *   0s, then repeat 12s→90s forever" cannot be expressed at all.
     *
     * The fix belongs upstream and is small: honour `loop` before arming the duration timer, and
     * accept an independent `loopStart` in `PlayOptions`. Until that ships, this manager withholds
     * `endTime` from a looping clip's play options (which is what disarms the timer) and sets the
     * loop region here.
     *
     * `SoundToken.sourceController` is TypeScript-`private` while `AudioSourceController.getSource`
     * is public, so the node is reachable at runtime but not through the types — hence the cast and
     * the shape check. If a later backend changes that shape this returns silently and the clip
     * degrades to the behaviour it has today: the region plays once and the clip stops.
     *
     * Seeking survives this. `SoundToken.seek` rebuilds the buffer source and copies `loop`,
     * `loopStart` and `loopEnd` off the old node onto the new one, so a jump inside a looping track
     * keeps the region.
     */
    private static applyLoopRegion(token: SoundToken, region: ClipRegion): void {
        const { startTime, endTime } = region;
        if (endTime === undefined || !Number.isFinite(endTime) || endTime <= startTime) {
            return;
        }
        // A clip decoded on a server, or under a backend that swapped the streaming path in, has no
        // buffer source to write to.
        if (typeof AudioBufferSourceNode === "undefined") {
            return;
        }

        const controller = (token as unknown as {
            sourceController?: { getSource?: () => unknown };
        }).sourceController;
        if (typeof controller?.getSource !== "function") {
            return;
        }
        const node = controller.getSource();
        if (!(node instanceof AudioBufferSourceNode)) {
            return;
        }

        // An in point for the repeat that sits outside the region describes nothing playable, so it
        // falls back to the region's own start rather than producing an inverted or zero-length loop.
        const requested = region.loopStart;
        const clamped = requested !== undefined && Number.isFinite(requested)
            ? Math.min(Math.max(requested, startTime), endTime)
            : startTime;

        node.loop = true;
        node.loopStart = clamped < endTime ? clamped : startTime;
        node.loopEnd = endTime;
    }

    private static clampToRegion(time: number, region: ClipRegion): number {
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
                    ...(sound.state.paused ? { paused: true } : {}),
                }
            ]),
            groups: this.getBuses().map(bus => [bus.id, bus.volume])
        };
    }

    public fromData(data: AudioManagerDataRaw, elementMap: Map<string, LogicAction.GameElement>): this {
        data.groups?.forEach(([id, volume]) => {
            this.setBusVolume(id, volume);
        });

        data.sounds.forEach(([soundId, soundData]) => {
            const sound = elementMap.get(soundId) as SoundElement;
            if (!sound) {
                // Not fatal. A sound reaches this manager from two places: the story's action graph,
                // whose elements are all in `elementMap`, and `LiveGame.playSound`, whose are not -
                // a host playing a UI sound owns it, and it has no business resuming out of a save.
                // A save whose story has since dropped a sound lands here too. Throwing made either
                // one fail the whole load, when the correct outcome is simply that this one clip
                // does not come back.
                this.gameState.logger.weakWarn(
                    "AudioManager",
                    `Skipped restoring a sound that is not in this story (id: "${soundId}")`,
                );
                return;
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
                const channel = this.channelFor(sound)!;
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
                    ...AudioManager.playRegionOf(region, sound.config.loop),
                    startTime: anchored ? region.startTime : data.position,
                    loop: sound.config.loop,
                    rate: sound.state.rate,
                });
                if (sound.config.loop) {
                    AudioManager.applyLoopRegion(token, region);
                }
                if (anchored && Math.abs(data.position - region.startTime) > 0.01) {
                    token.seek(AudioManager.clampToRegion(data.position, region));
                }

                this.state.set(sound, { token, cachedAudio, originalVolume: sound.state.volume });
                const isMuted = sound.state.muted ?? false;
                token.mute(isMuted);
                sound.state.muted = isMuted;

                // The record wins over the element, and falls back to it for a save written before
                // the record carried this. A paused clip is neither playing nor stopped: it holds
                // `position` until something resumes it, which is what a scene suspended by a call
                // is waiting to do.
                const paused = data.paused ?? sound.state.paused ?? false;
                sound.state.paused = paused;
                if (paused) {
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

    /**
     * Start a new game: stop everything and put the mixer back on the wire.
     *
     * The tree itself is **not** rebuilt - the channels are the same channels, because a bus is
     * part of the game's declared shape, not part of its state. What is re-applied is every bus's
     * current volume, read back off the mixer rather than off `SoundType`, which is what lets a
     * host's own buses exist here at all.
     *
     * Note the seeded three are then immediately overwritten from the preferences, exactly as
     * before; a bus the host declared keeps whatever volume the player left it at, because that is
     * a setting and not something a new game should undo.
     */
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

        if (this.isReady && this.busTree) {
            this.busTree.getNodes().forEach(node => {
                this.applyBusVolume(this.channels.get(node.id), this.mixer.getEffectiveVolume(node.id), false);
            });
        }
    }

    /**
     * Set **the player's** volume for a bus, 0..1, live. 1 means "leave the author's mix alone".
     *
     * Reaches sounds that are **already playing**: a bus is a gain node every clip beneath it is
     * routed through, so nothing has to be found, stopped or restarted for the change to be heard.
     * Setting a bus that has not been realized yet is fine - the value is kept and applied when the
     * audio context unlocks.
     *
     * Equivalent to `game.audioBuses.setVolume(...)`, which is the surface a host should prefer:
     * it exists before the player mounts.
     */
    public setBusVolume(id: SoundBusId, volume: number): void {
        this.mixer.setVolume(id, volume);
    }

    /**
     * The player's volume for a bus - what was last set, else 1. Not the author's declared mix
     * (`game.audioBuses.getDeclaredVolume`) and not what is on the gain node
     * (`getEffectiveVolume`).
     */
    public getBusVolume(id: SoundBusId): number {
        return this.mixer.getVolume(id);
    }

    /**
     * Every bus with its parent and both of its volumes, parents first. `volume` is the half a
     * host persists.
     */
    public getBuses(): AudioBusState[] {
        return this.mixer.list();
    }

    /**
     * @deprecated Use {@link AudioManager.setBusVolume}. Kept because the three sound types are
     * still bus ids and hosts call this with them.
     */
    public setGroupVolume(type: SoundBusId, volume: number): void {
        this.setBusVolume(type, volume);
    }

    /**
     * @deprecated Use {@link AudioManager.getBusVolume}.
     */
    public getGroupVolume(type: SoundBusId): number {
        return this.getBusVolume(type);
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

    public destroy(): void {
        this.reset();
        this.busSubscription?.cancel();
        this.busSubscription = null;
        this.sound.destroy();
    }

}
