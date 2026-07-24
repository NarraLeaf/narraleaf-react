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
export type VideoStateRaw = {
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

    /**
     * Create a video element with source and optional mute flag.
     * @param config - Source configuration for the video.
     * @example
     * ```ts
     * const video = new Video({ src: "https://example.com/video.mp4", muted: true });
     * ```
     */
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
     * Show the video element.
     * @chainable
     */
    show(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.show,
            []
        ));
    }

    /**
     * Hide the video element.
     * @chainable
     */
    hide(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.hide,
            []
        ));
    }

    /**
     * Play the video and wait until it finishes.
     * @chainable
     * @example
     * ```ts
     * video.play();
     * ```
     */
    play(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.play,
            []
        ));
    }

    /**
     * Pause the video, keeping its current position.
     * @chainable
     */
    pause(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.pause,
            []
        ));
    }

    /**
     * Resume playback from the current position.
     *
     * Unlike {@link play}, this does not wait for the video to finish.
     * @chainable
     */
    resume(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.resume,
            []
        ));
    }

    /**
     * Stop the video: pause it and end any pending {@link play} so the story continues.
     * @chainable
     */
    stop(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.stop,
            []
        ));
    }

    /**
     * Seek to a specific time (in seconds).
     * @chainable
     * @example
     * ```ts
     * video.seek(3);
     * ```
     */
    seek(time: number): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.seek,
            [time]
        ));
    }

    /**@internal */
    toData(): VideoStateRaw {
        return {
            state: {
                display: this.state.display,
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
