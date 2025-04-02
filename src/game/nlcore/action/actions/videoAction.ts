import {VideoActionContentType, VideoActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {Video} from "@core/elements/video";
import {GameState} from "@player/gameState";
import {Awaitable, SkipController, Values} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ExposedState, ExposedStateType} from "@player/type";
import {RuntimeGameError} from "@core/common/Utils";


export class VideoAction<T extends Values<typeof VideoActionTypes> = Values<typeof VideoActionTypes>>
    extends TypedAction<VideoActionContentType, T, Video> {
    static ActionTypes = VideoActionTypes;

    executeAction(gameState: GameState): Awaitable<CalledActionResult> {
        const action = this;
        const video: Video = this.callee;
        if (action.is<VideoAction<"video:play">>(VideoAction, "video:play")) {
            return this.changeStateAsync(gameState, (state) => state.play());
        } else if (action.is<VideoAction<"video:pause">>(VideoAction, "video:pause")) {
            return this.changeState(gameState, (state) => state.pause());
        } else if (action.is<VideoAction<"video:stop">>(VideoAction, "video:stop")) {
            return this.changeState(gameState, (state) => state.stop());
        } else if (action.is<VideoAction<"video:seek">>(VideoAction, "video:seek")) {
            return this.changeState(gameState, (state) => state.seek(action.contentNode.getContent()[0]));
        } else if (action.is<VideoAction<"video:show">>(VideoAction, "video:show")) {
            if (!gameState.isVideoAdded(video)) {
                gameState.addVideo(video);
                gameState.stage.update();
            }
            video.state.display = true;
            return this.changeState(gameState, (state) => state.show());
        } else if (action.is<VideoAction<"video:hide">>(VideoAction, "video:hide")) {
            return this.changeState(gameState, (state) => {
                video.state.display = false;

                state.hide();
                gameState.removeVideo(video);
                gameState.stage.update();
            });
        } else if (action.is<VideoAction<"video:resume">>(VideoAction, "video:resume")) {
            return this.changeState(gameState, (state) => state.resume());
        }

        throw this.unknownTypeError();
    }

    private changeStateBase(
        gameState: GameState,
        handler: (state: ExposedState[ExposedStateType.video]) => void | Promise<void>
    ): Awaitable<CalledActionResult> {
        if (!gameState.isVideoAdded(this.callee)) {
            throw new RuntimeGameError("Video is being used before it is added to the game\nUse video.show() to add the video to the game");
        }

        const video: Video = this.callee;
        const awaitable = new Awaitable<CalledActionResult>();
        const token = gameState.getExposedStateAsync<ExposedStateType.video>(video, async (state) => {
            gameState.logger.debug("Video Component state exposed", state);

            await handler(state);
            awaitable.resolve(super.executeAction(gameState) as CalledActionResult);
            gameState.stage.next();
        });
        awaitable.registerSkipController(new SkipController(token.cancel));

        return awaitable;
    }

    private changeState(gameState: GameState, handler: (state: ExposedState[ExposedStateType.video]) => void) {
        return this.changeStateBase(gameState, handler);
    }

    private changeStateAsync(gameState: GameState, handler: (state: ExposedState[ExposedStateType.video]) => Promise<void>) {
        return this.changeStateBase(gameState, handler);
    }
}