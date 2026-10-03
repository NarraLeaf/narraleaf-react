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
import type {TransformDefinitions} from "@core/elements/transform/type";


export type VideoConfig = {
    src: string;
    muted: boolean;
};

/**
 * How {@link Video.show} or {@link Video.hide} fades the clip in or out.
 *
 * Omitted, or with no positive `duration`, the clip appears or disappears at once - which is what
 * `show()` and `hide()` have always done.
 */
export type VideoFadeOptions = {
    /** How long the fade takes, in milliseconds. */
    duration?: number;
    /**
     * The curve of the fade: a named easing (`"linear"`, `"easeIn"`, `"easeOut"`, `"easeInOut"`) or a
     * cubic-bezier as four numbers. Linear when omitted. A named easing with no CSS equivalent falls
     * back to `"ease"`, as it does for a `Vfx` fade.
     */
    easing?: TransformDefinitions.EasingDefinition;
};

export type VideoState = {
    display: boolean;
};
export type VideoStateRaw = {
    state: VideoState;
};

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
     * Put the video element on the stage without showing it, so it can start buffering.
     *
     * A video that is not in the document has not begun to load. Declaring it ahead of the line
     * that shows or plays it is what turns "the movie starts" into something immediate rather
     * than a wait of unknown length on the player's connection.
     *
     * Resolves immediately, and does nothing to an element already on stage.
     * @chainable
     */
    preload(): Proxied<Video, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VideoActionTypes.preload,
            []
        ));
    }

    /**
     * Show the video element, putting it on the stage first if it is not there yet.
     *
     * With `options.duration`, the clip fades in over that many milliseconds and the action waits for
     * the fade to finish; it starts once the clip can present a frame, so what fades in is the picture
     * and not an empty rectangle. Without it the clip appears at once.
     * @chainable
     * @example
     * ```ts
     * video.show({duration: 500});
     * ```
     */
    show(options?: VideoFadeOptions): Proxied<Video, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VideoActionTypes.show,
            [options]
        ));
    }

    /**
     * Hide the video element and take it off the stage.
     *
     * With `options.duration`, the clip fades out over that many milliseconds - holding whatever frame
     * it is on, which after {@link play} is its last - and leaves the stage once the fade is over; the
     * action waits for that. Without it the clip disappears at once.
     *
     * A clip that is not on the stage has nothing to hide, and the call does nothing.
     * @chainable
     * @example
     * ```ts
     * // A cutscene that clears itself away when it ends
     * scene.action([
     *     video.show(),
     *     video.play(),
     *     video.hide({duration: 600}),
     * ]);
     * ```
     */
    hide(options?: VideoFadeOptions): Proxied<Video, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VideoActionTypes.hide,
            [options]
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
    play(): Proxied<Video, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VideoActionTypes.play,
            []
        ));
    }

    /**
     * Pause the video, keeping its current position.
     * @chainable
     */
    pause(): Proxied<Video, Chained<LogicAction.Actions>> {
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
    resume(): Proxied<Video, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VideoActionTypes.resume,
            []
        ));
    }

    /**
     * Stop the video: pause it and end any pending {@link play} so the story continues.
     * @chainable
     */
    stop(): Proxied<Video, Chained<LogicAction.Actions>> {
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
    seek(time: number): Proxied<Video, Chained<LogicAction.Actions>> {
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
        super.reset();
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
