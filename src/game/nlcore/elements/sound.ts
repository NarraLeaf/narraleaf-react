import {Actionable} from "@core/action/actionable";
import {Serializer} from "@lib/util/data";
import {LogicAction} from "@core/game";
import {ContentNode} from "@core/action/tree/actionTree";
import {SoundActionContentType, SoundActionTypes} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {SoundAction} from "@core/action/actions/soundAction";
import {Config, ConfigConstructor} from "@lib/util/config";

type ChainedSound = Proxied<Sound, Chained<LogicAction.Actions>>;

/**@internal */
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
     * Initial position in seconds
     * @default 0
     */
    seek: number;
}

type SoundConfig = {
    src: string;
    loop: boolean;
    streaming: boolean;
    seek: number;
};

type SoundState = {
    volume: number;
    rate: number;
    paused: boolean;
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
    });

    /**@internal */
    static DefaultConfig = new ConfigConstructor<SoundConfig>({
        src: Sound.noSound,
        loop: false,
        streaming: false,
        seek: 0,
    });

    /**@internal */
    static DefaultState = new ConfigConstructor<SoundState>({
        volume: 1,
        rate: 1,
        paused: false,
    });

    /**@internal */
    static StateSerializer = new Serializer<SoundState>();

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
    public readonly config: Readonly<SoundConfig>;
    /**@internal */
    public state: SoundState;
    /**@internal */
    private readonly userConfig: Config<ISoundUserConfig>;

    constructor(config?: Partial<ISoundUserConfig>);
    constructor(src?: string);
    constructor(arg0: Partial<ISoundUserConfig> | string = {}) {
        super();
        const rawConfig = typeof arg0 === "string" ? {src: arg0} : arg0;
        const userConfig = Sound.DefaultUserConfig.create(rawConfig);
        const [config] = userConfig.extract(Sound.DefaultConfig.keys());

        this.config = config.get();
        this.state = this.getInitialState(userConfig);
        this.userConfig = userConfig;
    }

    /**
     * Start playing the sound
     *
     * This action will be resolved when the sound reaches the end
     * @chainable
     */
    public play(duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:play"]>(SoundAction.ActionTypes.play, [{
            end: this.state.volume,
            duration: duration || 0,
        }]);
    }

    /**
     * @chainable
     */
    public stop(duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:stop"]>(SoundAction.ActionTypes.stop, [{
            end: 0,
            duration: duration || 0,
        }]);
    }

    /**
     * @chainable
     */
    public setVolume(volume: number, duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:setVolume"]>(SoundAction.ActionTypes.setVolume, [
            volume,
            duration || 0
        ]);
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
    public pause(duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:pause"]>(SoundAction.ActionTypes.pause, [{
            end: 0,
            duration: duration || 0,
        }]);
    }

    /**
     * @chainable
     */
    public resume(duration?: number): ChainedSound {
        return this.pushAction<SoundActionContentType["sound:resume"]>(SoundAction.ActionTypes.resume, [{
            end: this.state.volume,
            duration: duration || 0,
        }]);
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
    override reset() {
        this.state = this.getInitialState(this.userConfig);
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
