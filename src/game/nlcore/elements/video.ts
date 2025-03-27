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
    url: string;
    muted: boolean;
};

/**@internal */
type ChainedVideo = Proxied<Video, Chained<LogicAction.Actions>>;

export class Video extends Actionable<null> {
    /**@internal */
    static DefaultVideoConfig = new ConfigConstructor<VideoConfig>({
        url: "",
        muted: false,
    });

    /**@internal */
    public readonly config: Readonly<VideoConfig>;

    constructor(config: Partial<VideoConfig>) {
        super();
        const videoConfig = Video.DefaultVideoConfig.create(config);

        this.config = videoConfig.get();

        if (!this.config.url) {
            throw new RuntimeScriptError("Video must have a url");
        }
    }

    show(): ChainedVideo {
        return this.chain(this.createAction(
            VideoActionTypes.show,
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
