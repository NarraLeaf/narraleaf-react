import { Actionable } from "@core/action/actionable";
import { Serializer } from "@lib/util/data";
import { LogicAction } from "@core/game";
import { ContentNode } from "@core/action/tree/actionTree";
import { SoundActionContentType, SoundActionTypes } from "@core/action/actionTypes";
import { Chained, Proxied } from "@core/action/chain";
import { SoundAction } from "@core/action/actions/soundAction";
import { Config, ConfigConstructor } from "@lib/util/config";
import { StaticScriptWarning } from "../common/Utils";

type ChainedSound = Proxied<Sound, Chained<LogicAction.Actions>>;
export enum SoundType {
    Voice = "voice",
    Bgm = "bgm",
    Sound = "sound",
}

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
     * Set to `true` to force HTML5 Audio.
     * This should be used for large audio files
     * so that you don't have to wait for the full file to be downloaded and decoded before playing.
     * @default false
     */
    streaming: boolean;
    /**
     * Initial position in seconds - the clip's **in point**.
     *
     * When {@link ISoundUserConfig.loop} is set together with {@link ISoundUserConfig.endTime},
     * this is also where each repeat restarts from, so the two together describe a loop region
     * rather than just a starting offset.
     * @default 0
     */
    seek: number;
    /**
     * Position in seconds where the clip ends - its **out point**. Omit (or `undefined`) to play
     * through to the end of the file.
     *
     * Without `loop` the clip simply stops there. With `loop` it jumps back to
     * {@link ISoundUserConfig.seek}, which is how a piece of background music with an intro loops
     * only its body. The jump is sample-accurate (it is the Web Audio node's own loop), so there is
     * no gap and no drift over long sessions.
     *
     * Ignored for a clip that is streamed rather than decoded: an `<audio>` element has no loop
     * region, only a plain repeat.
     * @default undefined
     */
    endTime?: number;
    /**
     * The type of the sound
     * @default SoundType.Sound
     */
    type: SoundType;
}

type SoundConfig = {
    src: string;
    loop: boolean;
    streaming: boolean;
    seek: number;
    endTime?: number;
    type: SoundType;
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
        type: SoundType.Sound,
    });

    /**@internal */
    static DefaultConfig = new ConfigConstructor<SoundConfig>({
        src: Sound.noSound,
        loop: false,
        streaming: false,
        seek: 0,
        endTime: undefined,
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
     * @param arg0 - Source or config for the voice clip.
     * @example
     * ```ts
     * Sound.voice({ src: "voice.mp3" });
     * ```
     */
    public static voice(arg0: Partial<ISoundUserConfig> | string) {
        const config = typeof arg0 === "string" ? { src: arg0 } : arg0;
        return new Sound({ ...config, type: SoundType.Voice });
    }

    /**
     * Create background music that cannot be played via `play()`.
     * @param arg0 - Source or config for the bgm clip.
     * @example
     * ```ts
     * Sound.bgm("theme.mp3");
     * ```
     */
    public static bgm(arg0: Partial<ISoundUserConfig> | string) {
        const config = typeof arg0 === "string" ? { src: arg0 } : arg0;
        return new Sound({ ...config, type: SoundType.Bgm });
    }

    /**
     * Create a one-off sound effect.
     * @param arg0 - Source or config for the sound effect.
     */
    public static sound(arg0: Partial<ISoundUserConfig> | string) {
        const config = typeof arg0 === "string" ? { src: arg0 } : arg0;
        return new Sound({ ...config, type: SoundType.Sound });
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
     * @param duration - Optional fade duration in milliseconds.
     * @chainable
     * @example
     * ```ts
     * sound.play(1000);
     * ```
     */
    public play(duration?: number): ChainedSound {
        if (this.config.type === SoundType.Bgm) {
            throw new StaticScriptWarning(
                `Sound (src: ${this.config.src}) is marked as bgm, but it is being played as a normal sound. \n`
                + "To prevent unintended behavior, the sound marked as bgm cannot be played using `play()`."
            );
        }

        return this.pushAction<SoundActionContentType["sound:play"]>(SoundAction.ActionTypes.play, [{
            end: this.state.volume,
            duration: duration || 0,
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
