import {Actionable} from "@core/action/actionable";
import {deepEqual, deepMerge, DeepPartial, safeClone} from "@lib/util/data";
import {LogicAction} from "@core/game";
import {ContentNode} from "@core/action/tree/actionTree";
import * as Howler from "howler";
import {HowlOptions} from "howler";
import {SoundActionContentType, SoundActionTypes} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {SoundAction} from "@core/action/actions/soundAction";

type ChainedSound = Proxied<Sound, Chained<LogicAction.Actions>>;

export enum SoundType {
    soundEffect = "soundEffect",
    music = "music",
    voice = "voice",
    backgroundMusic = "backgroundMusic",
}

/**@internal */
export type SoundDataRaw = {
    config: SoundConfig;
};
/**@internal */
export type VoiceIdMap = Record<string | number, string | Sound>;
/**@internal */
export type VoiceSrcGenerator = (id: string | number) => string | Sound;

export type SoundConfig = {
    /**
     * Sound type
     * - **soundEffect**: Sound effect
     * - **music**: Music
     * - **voice**: Voice
     * - **backgroundMusic**: Background music
     */
    type?: SoundType;
    src: string;
    /**
     * If true, the operation will wait until the sound is played
     */
    sync: boolean;
    /**
     * Whether to loop, if sync and loop are both true, sync will be treated as **false**
     */
    loop: boolean;
    volume: number;
    streaming?: boolean;
};

export class Sound extends Actionable<SoundDataRaw> {
    /**@internal */
    static defaultConfig: SoundConfig = {
        src: "",
        sync: false,
        loop: false,
        volume: 1,
    };

    /**@internal */
    static toSoundSrc(v: Sound | string | null | undefined): string | null {
        if (v === null || v === undefined) {
            return null;
        }
        if (typeof v === "string") {
            return v;
        }
        return v.getSrc();
    }

    /**@internal */
    static toSound(v: Sound | string | null | undefined): Sound | null {
        if (v === null || v === undefined) {
            return null;
        }
        if (typeof v === "string") {
            return new Sound({src: v});
        }
        return v;
    }

    /**@internal */
    config: SoundConfig;
    /**@internal */
    state: {
        playing: null | Howler.Howl;
        token: number | null;
    } = {
        playing: null,
        token: null,
    };

    constructor(config?: DeepPartial<SoundConfig>);
    constructor(src?: string);
    constructor(arg0: DeepPartial<SoundConfig> | string = {}) {
        super();
        if (typeof arg0 === "string") {
            this.config = deepMerge<SoundConfig>(Sound.defaultConfig, {
                src: arg0
            });
        } else {
            this.config = deepMerge<SoundConfig>(Sound.defaultConfig, arg0);
        }
    }

    /**
     * @chainable
     */
    public play(): ChainedSound {
        if (this.config.type === SoundType.backgroundMusic) {
            throw new Error("Background music cannot be played directly");
        }
        return this.pushAction<SoundActionContentType["sound:play"]>(SoundAction.ActionTypes.play, [void 0]);
    }

    /**
     * @chainable
     */
    public stop(): ChainedSound {
        if (this.config.type === SoundType.backgroundMusic) {
            throw new Error("Background music cannot be stopped directly");
        }
        return this.pushAction<SoundActionContentType["sound:stop"]>(SoundAction.ActionTypes.stop, [void 0]);
    }

    /**
     * @chainable
     */
    public fade(start: number | undefined, end: number, duration: number): ChainedSound {
        if (this.config.type === SoundType.backgroundMusic) {
            throw new Error("Background music cannot be faded directly");
        }
        return this.pushAction<SoundActionContentType["sound:fade"]>(SoundAction.ActionTypes.fade, [{
            start, end, duration
        }]);
    }

    /**
     * @chainable
     */
    public setVolume(volume: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:setVolume"]>(SoundAction.ActionTypes.setVolume, [volume]);
    }

    /**
     * @chainable
     */
    public setRate(rate: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:setRate"]>(SoundAction.ActionTypes.setRate, [rate]);
    }

    /**
     * @chainable
     */
    public pause(fade?: number): ChainedSound {
        if (fade !== undefined) {
            return this.fade(undefined, 0, fade);
        }
        return this.pushAction<SoundActionContentType["sound:pause"]>(SoundAction.ActionTypes.pause, [void 0]);
    }

    /**
     * @chainable
     */
    public resume(fade?: number): ChainedSound {
        if (fade !== undefined) {
            return this.fade(0, this.config.volume, fade);
        }
        return this.pushAction<SoundActionContentType["sound:resume"]>(SoundAction.ActionTypes.resume, [void 0]);
    }

    /**@internal */
    getHowlOptions(options?: Partial<HowlOptions>): HowlOptions {
        return {
            src: this.config.src,
            loop: this.config.loop,
            volume: this.config.volume,
            html5: this.config.streaming,
            autoplay: false,
            ...(options || {})
        };
    }

    /**@internal */
    getSrc() {
        return this.config.src;
    }

    /**@internal */
    getToken(): number | never {
        return this.state.token || (undefined as never);
    }

    /**@internal */
    getPlaying() {
        return this.state.playing;
    }

    /**@internal */
    setToken(token: number | null | undefined) {
        this.state.token = typeof token === "undefined" ? null : token;
    }

    /**@internal */
    setPlaying(howl: Howler.Howl | null) {
        this.state.playing = howl;
        return this;
    }

    /**@internal */
    toData(): SoundDataRaw | null {
        if (deepEqual(this.config, Sound.defaultConfig)) {
            return null;
        }
        return {
            config: safeClone(this.config)
        };
    }

    /**@internal */
    fromData(data: SoundDataRaw): this {
        this.config = deepMerge<SoundConfig & SoundDataRaw>(this.config, data.config);
        return this;
    }

    /**@internal */
    override reset() {
        this.state.playing?.stop();
        this.state.playing = null;
        this.state.token = null;
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
