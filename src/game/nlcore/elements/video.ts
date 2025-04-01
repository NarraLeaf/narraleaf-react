import {Actionable} from "@core/action/actionable";
import {ConfigConstructor, MergeConfig} from "@lib/util/config";
import {RuntimeScriptError} from "@core/common/Utils";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/game";
import {VideoActionContentType, VideoActionTypes} from "@core/action/actionTypes";
import {Values} from "@lib/util/data";
import {VideoAction} from "@core/action/actions/videoAction";
import {ContentNode} from "../action/tree/actionTree";
import {EmptyObject} from "@core/elements/transition/type";
import {ElementStateRaw} from "@core/elements/story";


export type VideoConfig = {
    src: string;
    muted: boolean;
};

/**@internal */
type VideoState = {
    display: boolean;
};
/**@internal */
type VideoStateRaw = {
    state: VideoState;
};

/**@internal */
type ChainedVideo = Proxied<Video, Chained<LogicAction.Actions>>;

export class Video extends Actionable<VideoStateRaw> {
    /**@internal */
    static DefaultVideoConfig = new ConfigConstructor<VideoConfig, EmptyObject>({
        src: "",
        muted: false,
    });
    /**@internal */
    static DefaultVideoState = new ConfigConstructor<VideoState, EmptyObject>({
        display: false,
    });

    /**@internal */
    public readonly config: Readonly<VideoConfig>;
    /**@internal */
    public state: VideoState;

    constructor(config: Partial<VideoConfig>) {
        super();
        const videoConfig = Video.DefaultVideoConfig.create(config);

        this.config = videoConfig.get();
        this.state = this.getInitialState();

        if (!this.config.src) {
            throw new RuntimeScriptError("Video must have a src");
        }
    }

    /**
     * @chainable
     */
    show(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.show,
            []
        ));
    }

    /**
     * @chainable
     */
    hide(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.hide,
            []
        ));
    }

    /**
     * Play the video
     *
     * The action will be resolved when the video ends
     * @chainable
     */
    play(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.play,
            []
        ));
    }

    /**
     * @chainable
     */
    pause(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.pause,
            []
        ));
    }

    /**
     * @chainable
     */
    stop(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.stop,
            []
        ));
    }

    /**
     * Seek to a specific time in the video
     *
     * @param time - The time to seek to in seconds
     * @chainable
     */
    seek(time: number): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.seek,
            [time]
        ));
    }

    /**
     * @chainable
     */
    resume(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.resume,
            []
        ));
    }

    /**@internal */
    toData(): VideoStateRaw {
        return {
            state: {
                display: false,
            }
        };
    }

    /**@internal */
    fromData(raw: ElementStateRaw): this {
        const {state} = raw;
        this.state = {
            display: state.display,
        };
        return this;
    }

    /**@internal */
    reset() {
        this.state = this.getInitialState();
        return this;
    }

    /**@internal */
    private getInitialState(): MergeConfig<VideoState> {
        return Video.DefaultVideoState.create().get();
    }

    /**@internal */
    private createAction<U extends Values<typeof VideoActionTypes>>(
        type: U,
        content: VideoActionContentType[U]
    ): VideoAction<U> {
        return new VideoAction<U>(
            this.chain(),
            type,
            ContentNode.create(content)
        );
    }
}
