import {VideoActionContentType, VideoActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {Video} from "@core/elements/video";
import {GameState} from "@player/gameState";
import {Awaitable, Values} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ExposedState, ExposedStateType} from "@player/type";


export class VideoAction<T extends Values<typeof VideoActionTypes> = Values<typeof VideoActionTypes>>
    extends TypedAction<VideoActionContentType, T, Video> {
    static ActionTypes = VideoActionTypes;

    executeAction(gameState: GameState): Awaitable<CalledActionResult> {
        const action = this;
        if (action.is<VideoAction<"video:play">>(VideoAction, "video:play")) {
            return this.changeState(gameState, (state) => state.play());
        } else if (action.is<VideoAction<"video:pause">>(VideoAction, "video:pause")) {
            return this.changeState(gameState, (state) => state.pause());
        } else if (action.is<VideoAction<"video:stop">>(VideoAction, "video:stop")) {
            return this.changeState(gameState, (state) => state.stop());
        } else if (action.is<VideoAction<"video:seek">>(VideoAction, "video:seek")) {
            return this.changeState(gameState, (state) => state.seek(action.contentNode.getContent()[0]));
        } else if (action.is<VideoAction<"video:show">>(VideoAction, "video:show")) {
            return this.changeState(gameState, (state) => state.show());
        } else if (action.is<VideoAction<"video:hide">>(VideoAction, "video:hide")) {
            return this.changeState(gameState, (state) => state.hide());
        } else if (action.is<VideoAction<"video:resume">>(VideoAction, "video:resume")) {
            return this.changeState(gameState, (state) => state.resume());
        }

        throw this.unknownTypeError();
    }

    private changeState(gameState: GameState, handler: (state: ExposedState[ExposedStateType.video]) => void) {
        const video: Video = this.callee;
        const awaitable = new Awaitable<CalledActionResult>();
        gameState.getExposedStateAsync<ExposedStateType.video>(video, (state) => {
            handler(state);
            awaitable.resolve(super.executeAction(gameState) as CalledActionResult);
        });

        return awaitable;
    }
}