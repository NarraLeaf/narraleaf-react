import {Actionable} from "@core/action/actionable";
import {ConfigConstructor} from "@lib/util/config";
import {RuntimeScriptError} from "@core/common/Utils";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/game";
import {VideoActionContentType, VideoActionTypes} from "@core/action/actionTypes";
import {Values} from "@lib/util/data";
import {VideoAction} from "@core/action/actions/videoAction";
import { ContentNode } from "../action/tree/actionTree";


export type VideoConfig = {
    src: string;
    muted: boolean;
};

/**@internal */
type ChainedVideo = Proxied<Video, Chained<LogicAction.Actions>>;

export class Video extends Actionable<null> {
    /**@internal */
    static DefaultVideoConfig = new ConfigConstructor<VideoConfig>({
        src: "",
        muted: false,
    });

    /**@internal */
    public readonly config: Readonly<VideoConfig>;

    constructor(config: Partial<VideoConfig>) {
        super();
        const videoConfig = Video.DefaultVideoConfig.create(config);

        this.config = videoConfig.get();

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
