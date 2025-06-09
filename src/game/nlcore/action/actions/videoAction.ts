import {VideoActionContentType, VideoActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {Video} from "@core/elements/video";
import {GameState} from "@player/gameState";
import {Awaitable, SkipController, Values} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ExposedState, ExposedStateType} from "@player/type";
import {RuntimeGameError} from "@core/common/Utils";
import { ActionExecutionInjection } from "@core/action/action";
import { ActionHistoryPushOptions } from "@core/action/actionHistory";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

export class VideoAction<T extends Values<typeof VideoActionTypes> = Values<typeof VideoActionTypes>>
    extends TypedAction<VideoActionContentType, T, Video> {
    static ActionTypes = VideoActionTypes;

    executeAction(gameState: GameState, injection: ActionExecutionInjection): Awaitable<CalledActionResult> {
        const action = this;
        const video: Video = this.callee;
        const historyProps: ActionHistoryPushOptions = {
            action: action,
            stackModel: injection.stackModel
        };

        if (action.is<VideoAction<"video:play">>(VideoAction, "video:play")) {
            return this.changeStateAsync(gameState, (state) => state.play(), injection);
        } else if (action.is<VideoAction<"video:pause">>(VideoAction, "video:pause")) {
            return this.changeState(gameState, (state) => state.pause(), injection);
        } else if (action.is<VideoAction<"video:stop">>(VideoAction, "video:stop")) {
            return this.changeState(gameState, (state) => state.stop(), injection);
        } else if (action.is<VideoAction<"video:seek">>(VideoAction, "video:seek")) {
            return this.changeState(gameState, (state) => state.seek(action.contentNode.getContent()[0]), injection);
        } else if (action.is<VideoAction<"video:show">>(VideoAction, "video:show")) {
            const originalVisible = video.state.display;
            if (!gameState.isVideoAdded(video)) {
                gameState.addVideo(video);
                gameState.stage.update();
            }
            video.state.display = true;

            gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                video.state.display = prevVisible;
            }, [originalVisible]);

            return this.changeState(gameState, (state) => state.show(), injection);
        } else if (action.is<VideoAction<"video:hide">>(VideoAction, "video:hide")) {
            const originalVisible = video.state.display;
            return this.changeState(gameState, (state) => {
                video.state.display = false;

                gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                    video.state.display = prevVisible;
                }, [originalVisible]);

                state.hide();
                gameState.removeVideo(video);
                gameState.stage.update();
            }, injection);
        } else if (action.is<VideoAction<"video:resume">>(VideoAction, "video:resume")) {
            return this.changeState(gameState, (state) => state.resume(), injection);
        }

        throw this.unknownTypeError();
    }

    private changeStateBase(
        gameState: GameState,
        handler: (state: ExposedState[ExposedStateType.video]) => void | Promise<void>,
        injection: ActionExecutionInjection
    ): Awaitable<CalledActionResult> {
        if (!gameState.isVideoAdded(this.callee)) {
            throw new RuntimeGameError("Video is being used before it is added to the game\nUse video.show() to add the video to the game");
        }

        const video: Video = this.callee;
        const awaitable = new Awaitable<CalledActionResult>();
        const token = gameState.getExposedStateAsync<ExposedStateType.video>(video, async (state) => {
            gameState.logger.debug("Video Component state exposed", state);

            await handler(state);
            awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
        });
        awaitable.registerSkipController(new SkipController(token.cancel));

        return awaitable;
    }

    private changeState(gameState: GameState, handler: (state: ExposedState[ExposedStateType.video]) => void, injection: ActionExecutionInjection) {
        return this.changeStateBase(gameState, handler, injection);
    }

    private changeStateAsync(gameState: GameState, handler: (state: ExposedState[ExposedStateType.video]) => Promise<void>, injection: ActionExecutionInjection) {
        return this.changeStateBase(gameState, handler, injection);
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("VideoAction");
    }
}