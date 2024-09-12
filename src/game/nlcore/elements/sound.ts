import {Actionable} from "@core/action/actionable";
import {deepEqual, deepMerge, DeepPartial, safeClone} from "@lib/util/data";
import {SoundAction} from "@core/action/actions";
import {Game} from "@core/game";
import {ContentNode} from "@core/action/tree/actionTree";
import * as Howler from "howler";
import {HowlOptions} from "howler";
import {SoundActionContentType} from "@core/action/actionTypes";

export enum SoundType {
    soundEffect = "soundEffect",
    music = "music",
    voice = "voice",
    backgroundMusic = "backgroundMusic",
}

export type SoundDataRaw = {
    config: SoundConfig;
};

export type SoundConfig = {
    // @todo: 速读模式
    // @todo: 速读模式中忽略voice和soundEffect
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
    static defaultConfig: SoundConfig = {
        src: "",
        sync: false,
        loop: false,
        volume: 1,
    };
    config: SoundConfig;
    state: {
        playing: null | Howler.Howl;
        token: any;
    } = {
        playing: null,
        token: null,
    };

    constructor(config: DeepPartial<SoundConfig> = {}) {
        super(Actionable.IdPrefixes.Sound);
        this.config = deepMerge<SoundConfig>(Sound.defaultConfig, config);
    }

    public play(): this {
        if (this.config.type === SoundType.backgroundMusic) {
            throw new Error("Background music cannot be played directly");
        }
        return this.pushAction<SoundActionContentType["sound:play"]>(SoundAction.ActionTypes.play, [void 0]);
    }

    public stop(): this {
        if (this.config.type === SoundType.backgroundMusic) {
            throw new Error("Background music cannot be stopped directly");
        }
        return this.pushAction<SoundActionContentType["sound:stop"]>(SoundAction.ActionTypes.stop, [void 0]);
    }

    public fade(start: number, end: number, duration: number): this {
        if (this.config.type === SoundType.backgroundMusic) {
            throw new Error("Background music cannot be faded directly");
        }
        return this.pushAction<SoundActionContentType["sound:fade"]>(SoundAction.ActionTypes.fade, [{
            start, end, duration
        }]);
    }

    public setVolume(volume: number): this {
        return this.pushAction<SoundActionContentType["sound:setVolume"]>(SoundAction.ActionTypes.setVolume, [volume]);
    }

    public setRate(rate: number): this {
        return this.pushAction<SoundActionContentType["sound:setRate"]>(SoundAction.ActionTypes.setRate, [rate]);
    }

    getHowlOptions(): HowlOptions {
        return {
            src: this.config.src,
            loop: this.config.loop,
            volume: this.config.volume,
            html5: this.config.streaming,
            autoplay: false,
        };
    }

    getSrc() {
        return this.config.src;
    }

    $setToken(token: any) {
        this.state.token = token;
    }

    $getToken() {
        return this.state.token;
    }

    $setHowl(howl: Howler.Howl | null) {
        this.state.playing = howl;
    }

    $getHowl() {
        return this.state.playing;
    }

    $stop() {
        this.$setToken(null);
        this.$setHowl(null);
    }

    public toData(): SoundDataRaw | null {
        if (deepEqual(this.config, Sound.defaultConfig)) {
            return null;
        }
        return {
            config: safeClone(this.config)
        };
    }

    public fromData(data: SoundDataRaw): this {
        this.config = deepMerge<SoundConfig & SoundDataRaw>(this.config, data.config);
        return this;
    }

    private pushAction<T>(type: string, content: T): this {
        const action = new SoundAction(
            this,
            type,
            new ContentNode<T>(Game.getIdManager().getStringId()).setContent(content)
        );
        this.actions.push(action);
        return this;
    }
}
