import { Actionable } from "@core/action/actionable";
import { Serializer } from "@lib/util/data";
import { LogicAction } from "@core/game";
import { ContentNode } from "@core/action/tree/actionTree";
import { SoundActionContentType, SoundActionTypes } from "@core/action/actionTypes";
import { Chained, Proxied } from "@core/action/chain";
import { SoundAction } from "@core/action/actions/soundAction";
import { Config, ConfigConstructor } from "@lib/util/config";
import { DefaultAudioBusIds, getActiveAudioBusTree } from "@core/game/audioBus";

type ChainedSound = Proxied<Sound, Chained<LogicAction.Actions>>;
export enum SoundType {
    Voice = "voice",
    Bgm = "bgm",
    Sound = "sound",
}

/**
 * The audio bus a clip plays on.
 *
 * The three {@link SoundType} values are buses the engine always seeds and they mean exactly what
 * they have always meant. Any other string is a bus the host declared in
 * {@link import("@core/gameTypes").GameConfig.audioBuses} — `"alice"` under `"voice"`, `"ambience"`
 * under `"bgm"`, as deep as makes sense.
 *
 * The `(string & {})` half is what widens this without giving up the completions: an editor still
 * offers `"bgm" | "sound" | "voice"` first, and still narrows a `SoundType` where one is expected.
 */
export type SoundBusId = SoundType | (string & {});

export type SoundDataRaw = {
    state: Record<string, any>;
};
export type VoiceIdMap = Record<string | number, string | Sound>;
export type VoiceSrcGenerator = (id: string | number) => string | Sound;

export interface ISoundUserConfig {
    /**
     * Sound source should be a URL or a base64 string
     */
    src: string;
    /**
     * Whether to loop, if sync and loop are both true, sync will be treated as **false**
     * @default false
     */
    loop: boolean;
    /**
     * Initial volume, between 0 and 1
     * @default 1
     */
    volume: number;
    /**
     * Playback rate, 0.5 to 4
     * @default 1
     */
    rate: number;
    /**
     * Set to `true` to force this clip to be streamed through an HTML5 `<audio>` element instead of
     * decoded into memory. Use it for large audio files: playback starts as soon as the first bytes
     * arrive rather than after the whole file has been downloaded and decoded, and no decoded PCM
     * buffer is held for as long as it plays.
     *
     * Leaving it `false` does not forbid streaming — it leaves the choice to the engine, which
     * streams whole-file loops (background music, by construction) and decodes everything else. See
     * {@link import("@core/gameTypes").GameConfig.audioStreaming} for that rule and how to turn it
     * off.
     *
     * A streamed clip has no loop *region*: with `loop` it repeats the whole file, so
     * {@link ISoundUserConfig.endTime} and {@link ISoundUserConfig.loopStart} are ignored for one.
     * @default false
     */
    streaming: boolean;
    /**
     * Initial position in seconds - the clip's **in point**.
     *
     * When {@link ISoundUserConfig.loop} is set together with {@link ISoundUserConfig.endTime},
     * this is also where each repeat restarts from, so the two together describe a loop region
     * rather than just a starting offset — unless {@link ISoundUserConfig.loopStart} moves the
     * repeat's in point somewhere else.
     * @default 0
     */
    seek: number;
    /**
     * Position in seconds where the clip ends - its **out point**. Omit (or `undefined`) to play
     * through to the end of the file.
     *
     * Without `loop` the clip simply stops there. With `loop` it jumps back to
     * {@link ISoundUserConfig.loopStart}, or to {@link ISoundUserConfig.seek} when no loop in point
     * was given — which is how a piece of background music with an intro loops only its body. The
     * jump is sample-accurate (it is the Web Audio node's own loop), so there is no gap and no
     * drift over long sessions.
     *
     * Ignored for a clip that is streamed rather than decoded: an `<audio>` element has no loop
     * region, only a plain repeat.
     * @default undefined
     */
    endTime?: number;
    /**
     * Position in seconds the clip returns to on every repeat — the **loop in point**.
     *
     * Only meaningful together with `loop` and {@link ISoundUserConfig.endTime}: it is the start of
     * the region that repeats, while {@link ISoundUserConfig.seek} stays the position the *first*
     * pass begins at. Leaving it out makes each repeat return to `seek`, which is the behaviour of
     * a clip that has no separate intro.
     *
     * Separating the two is what expresses the standard "intro then loop" piece of background
     * music — play from the top once, then repeat only the body forever:
     *
     * ```ts
     * Sound.bgm({src: "theme.mp3", loop: true, seek: 0, loopStart: 12, endTime: 90});
     * ```
     *
     * A value outside `[seek, endTime)` describes no playable region and falls back to `seek`.
     * @default undefined
     */
    loopStart?: number;
    /**
     * The audio bus this clip plays on.
     *
     * One of the three seeded buses, or the id of any bus the host declared in
     * {@link import("@core/gameTypes").GameConfig.audioBuses}. The bus decides which volume the
     * player controls governs this clip, and nothing else — a clip on any bus can be played,
     * stopped, faded and seeked the same way.
     * @default SoundType.Sound
     */
    type: SoundBusId;
}

type SoundConfig = {
    src: string;
    loop: boolean;
    streaming: boolean;
    seek: number;
    endTime?: number;
    loopStart?: number;
    type: SoundBusId;
};

type SoundState = {
    volume: number;
    rate: number;
    paused: boolean;
    muted: boolean;
};

export class Sound extends Actionable<SoundDataRaw, Sound> {
    /**@internal */
    static noSound = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgA";

    /**@internal */
    static DefaultUserConfig = new ConfigConstructor<ISoundUserConfig>({
        src: Sound.noSound,
        loop: false,
        volume: 1,
        streaming: false,
        rate: 1,
        seek: 0,
        endTime: undefined,
        loopStart: undefined,
        type: SoundType.Sound,
    });

    /**@internal */
    static DefaultConfig = new ConfigConstructor<SoundConfig>({
        src: Sound.noSound,
        loop: false,
        streaming: false,
        seek: 0,
        endTime: undefined,
        loopStart: undefined,
        type: SoundType.Sound,
    });

    /**@internal */
    static DefaultState = new ConfigConstructor<SoundState>({
        volume: 1,
        rate: 1,
        paused: false,
        muted: false,
    });

    /**@internal */
    static StateSerializer = new Serializer<SoundState>();

    /**@internal */
    static toSound(v: Sound | string | null | undefined): Sound | null {
        if (v === null || v === undefined) {
            return null;
        }
        if (typeof v === "string") {
            return new Sound({ src: v });
        }
        return v;
    }

    /**@internal */
    static isSound(v: any): v is Sound {
        return v instanceof Sound;
    }

    /**
     * Create a voice sound for dialog lines.
     *
     * `type` picks the bus and defaults to `voice`; pass one to put the line on a bus beneath it,
     * which is how a game gives each member of its cast a volume of its own. It used to be
     * overwritten and silently ignored here.
     * @param arg0 - Source or config for the voice clip.
     * @example
     * ```ts
     * Sound.voice({ src: "voice.mp3" });
     * Sound.voice({ src: "alice-01.mp3", type: "alice" }); // a bus declared under `voice`
     * ```
     */
    public static voice(arg0: Partial<ISoundUserConfig> | string) {
        const config = typeof arg0 === "string" ? { src: arg0 } : arg0;
        return new Sound({ type: SoundType.Voice, ...config });
    }

    /**
     * Create background music that cannot be played via `play()`.
     *
     * `type` defaults to `bgm` and may name any bus beneath it.
     * @param arg0 - Source or config for the bgm clip.
     * @example
     * ```ts
     * Sound.bgm("theme.mp3");
     * ```
     */
    public static bgm(arg0: Partial<ISoundUserConfig> | string) {
        const config = typeof arg0 === "string" ? { src: arg0 } : arg0;
        return new Sound({ type: SoundType.Bgm, ...config });
    }

    /**
     * Create a one-off sound effect.
     *
     * `type` defaults to `sound` and may name any bus beneath it.
     * @param arg0 - Source or config for the sound effect.
     */
    public static sound(arg0: Partial<ISoundUserConfig> | string) {
        const config = typeof arg0 === "string" ? { src: arg0 } : arg0;
        return new Sound({ type: SoundType.Sound, ...config });
    }

    /**@internal */
    public readonly config: Readonly<SoundConfig>;
    /**@internal */
    public state: SoundState;
    /**@internal */
    private readonly userConfig: Config<ISoundUserConfig>;

    constructor(config?: Partial<ISoundUserConfig>);
    constructor(src?: string);
    constructor(arg0: Partial<ISoundUserConfig> | string)
    constructor(arg0: Partial<ISoundUserConfig> | string = {}) {
        super();
        const rawConfig = typeof arg0 === "string" ? { src: arg0 } : arg0;
        const userConfig = Sound.DefaultUserConfig.create(rawConfig);
        const [config] = userConfig.extract(Sound.DefaultConfig.keys());

        this.config = config.get();
        this.state = this.getInitialState(userConfig);
        this.userConfig = userConfig;
    }

    /**
     * Start playing the sound and wait for it to finish.
     *
     * A clip of any {@link SoundType} may be played this way. `type` selects which volume slider
     * governs the clip and nothing else, so putting an ambience track on `bgm` so the player's music
     * slider controls it, and then playing it from an ordinary line, is a legitimate thing to want.
     *
     * It is *not* the same as {@link Scene.setBackgroundMusic}: a clip played here is not in the
     * scene's background-music slot, so leaving the scene will not stop it and no cross-fade is
     * arranged for it. That is true of every clip played this way, on any bus.
     * The script carries on as soon as the clip is playing. A clip that is meant to hold the script
     * until it finishes says so: `sound.play(0, {waitForEnd: true})`.
     *
     * @param duration - Optional fade duration in milliseconds.
     * @param options.waitForEnd - Hold the script until the clip finishes. Ignored for a looping clip.
     * @chainable
     * @example
     * ```ts
     * sound.play(1000);
     * ```
     */
    public play(duration?: number, options?: {waitForEnd?: boolean}): ChainedSound {
        // "Under the music bus", not "is the music bus" - a clip on `ambience` beneath `bgm` is
        // just as much not-the-scene's-slot as one on `bgm` itself. A bus nobody declared reads as
        // `false` here on purpose: this is a nudge, and nudging about a bus the engine cannot
        // resolve would fire on every custom bus in the game.
        if (getActiveAudioBusTree().isUnder(this.config.type, DefaultAudioBusIds.bgm)) {
            // Not an error. This used to throw, which took down the whole story at chain-build time
            // over a choice the author is allowed to make — and it never protected anything: `type`
            // only picks a gain channel, `LiveGame.playSound` has always played bgm-typed clips
            // through the same manager path with no check at all, and the scene's slot is a
            // separate reference that this cannot reach. What is worth saying out loud is that the
            // author may have meant the slot, because the clip will now outlive the scene.
            console.warn(
                `NarraLeaf-React [Sound] Playing a bgm-typed sound (src: ${this.config.src}) with \`play()\`. `
                + "It will play on the music bus but is not the scene's background music, so leaving the "
                + "scene will not stop it and it will not cross-fade. Use `scene.setBackgroundMusic()` if "
                + "that is what you wanted."
            );
        }

        return this.pushAction<SoundActionContentType["sound:play"]>(SoundAction.ActionTypes.play, [{
            end: this.state.volume,
            duration: duration || 0,
            waitForEnd: options?.waitForEnd === true,
        }]);
    }

    /**
     * Stop the sound and optionally fade out.
     * @param duration - Fade duration in milliseconds.
     * @chainable
     */
    public stop(duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:stop"]>(SoundAction.ActionTypes.stop, [{
            end: 0,
            duration: duration || 0,
        }]);
    }

    /**
     * Change the sound volume gradually.
     * @param volume - Target volume (0-1).
     * @param duration - Fade duration in milliseconds.
     * @chainable
     * @example
     * ```ts
     * sound.setVolume(0.5, 500);
     * ```
     */
    public setVolume(volume: number, duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:setVolume"]>(SoundAction.ActionTypes.setVolume, [
            volume,
            duration || 0
        ]);
    }

    /**
     * Mute or unmute the sound.
     * @param muted - `true` to mute, `false` to restore volume.
     * @chainable
     */
    public mute(muted: boolean = true): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:mute"]>(SoundAction.ActionTypes.mute, [muted]);
    }

    /**
     * Alias of `mute(false)` to restore audio.
     * @chainable
     */
    public unmute(): ChainedSound {
        return this.mute(false);
    }

    /**
     * Change the playback rate.
     * @param rate - Playback multiplier (1 is normal speed).
     * @chainable
     */
    public setRate(rate: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:setRate"]>(SoundAction.ActionTypes.setRate, [rate]);
    }

    /**
     * Pause the sound, optionally fading out.
     * @param duration - Fade duration in milliseconds.
     * @chainable
     */
    public pause(duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:pause"]>(SoundAction.ActionTypes.pause, [{
            end: 0,
            duration: duration || 0,
        }]);
    }

    /**
     * Resume playback, optionally fading in.
     * @param duration - Fade duration in milliseconds.
     * @chainable
     */
    public resume(duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:resume"]>(SoundAction.ActionTypes.resume, [{
            end: this.state.volume,
            duration: duration || 0,
        }]);
    }

    /**
     * Jump to a position in the clip, in seconds, and keep playing from there.
     *
     * A no-op on a sound that is not currently playing - there is nothing to move. The loop region
     * (see {@link ISoundUserConfig.endTime}) survives the jump, so seeking inside a looping track
     * does not turn it into a one-shot.
     * @param time - Position in seconds, measured from the start of the file (not from the in point).
     * @chainable
     * @example
     * ```ts
     * sound.seek(30);
     * ```
     */
    public seek(time: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:seek"]>(SoundAction.ActionTypes.seek, [time]);
    }

    /**@internal */
    getSrc() {
        return this.config.src;
    }

    /**@internal */
    toData(): SoundDataRaw | null {
        return {
            state: Sound.StateSerializer.serialize(this.state)
        };
    }

    /**@internal */
    fromData(data: SoundDataRaw): this {
        this.state = Sound.StateSerializer.deserialize(data.state);
        return this;
    }

    /**
     * Create a sound with the same configuration
     */
    public copy(): Sound {
        return new Sound(this.userConfig.get());
    }

    /**@internal */
    override reset(): this {
        super.reset();
        this.state = this.getInitialState(this.userConfig);
        return this;
    }

    /**@internal */
    private getInitialState(userConfig: Config<ISoundUserConfig>): SoundState {
        const state = Sound.DefaultState.create({
            ...userConfig.get(),
        });
        return state.get() satisfies SoundState;
    }

    /**@internal */
    private pushAction<T>(type: typeof SoundActionTypes[keyof typeof SoundActionTypes], content: T): ChainedSound {
        return this.chain(new SoundAction(
            this.chain(),
            type,
            new ContentNode<T>().setContent(content)
        ));
    }
}
