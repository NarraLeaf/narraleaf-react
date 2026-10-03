import {VideoActionContentType, VideoActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {Video, VideoFadeOptions} from "@core/elements/video";
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

        if (action.is<VideoAction<"video:preload">>(VideoAction, "video:preload")) {
            // On stage, invisible: the component mounts a `preload="auto"` element and keeps it
            // hidden while `display` is false, which is the whole of what this buys.
            if (gameState.isVideoAdded(video)) {
                return Awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
            }
            gameState.addVideo(video);
            gameState.stage.update();

            gameState.actionHistory.push(historyProps, () => {
                if (gameState.isVideoAdded(video)) {
                    gameState.removeVideo(video);
                    gameState.stage.update();
                }
            });

            return Awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
        } else if (action.is<VideoAction<"video:play">>(VideoAction, "video:play")) {
            // A clip can be played without ever being shown, so the report is asked for here too.
            gameState.reportUnwarmedVideo(video);
            return this.changeStateAsync(gameState, (state) => state.play(), injection);
        } else if (action.is<VideoAction<"video:pause">>(VideoAction, "video:pause")) {
            return this.changeState(gameState, (state) => state.pause(), injection);
        } else if (action.is<VideoAction<"video:stop">>(VideoAction, "video:stop")) {
            return this.changeState(gameState, (state) => state.stop(), injection);
        } else if (action.is<VideoAction<"video:seek">>(VideoAction, "video:seek")) {
            return this.changeState(gameState, (state) => state.seek(action.contentNode.getContent()[0]), injection);
        } else if (action.is<VideoAction<"video:show">>(VideoAction, "video:show")) {
            const [options] = (action as VideoAction<typeof VideoActionTypes.show>).contentNode.getContent();
            const originalVisible = video.state.display;
            // Asked before the element goes on, because after it the answer is always "warm".
            gameState.reportUnwarmedVideo(video);
            if (!gameState.isVideoAdded(video)) {
                gameState.addVideo(video);
                gameState.stage.update();
            }

            if (!VideoAction.fades(options)) {
                video.state.display = true;

                gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                    video.state.display = prevVisible;
                }, [originalVisible]);

                return this.changeState(gameState, (state) => state.show(), injection);
            }

            gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                video.state.display = prevVisible;
            }, [originalVisible]);

            // `display` turns true where the fade starts and not before. The element shows what
            // `display` says from the moment it mounts, so setting it up here would put a clip that is
            // still loading on screen at full opacity, with the fade then running from 1 to 1.
            return this.changeStateFading(gameState, async (state) => {
                video.state.display = true;
                await state.show(options);
            }, injection);
        } else if (action.is<VideoAction<"video:hide">>(VideoAction, "video:hide")) {
            // Nothing to hide. A clip leaves the stage when it is hidden, so this is what a second
            // hide - or a hide after a cutscene that cleared itself away - finds.
            if (!gameState.isVideoOnStage(video)) {
                gameState.logger.weakWarn("NarraLeaf-React: Video", "Hiding a video that is not on the stage, ignored. (src: " + video.config.src + ")");
                return Awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
            }

            const [options] = (action as VideoAction<typeof VideoActionTypes.hide>).contentNode.getContent();
            const originalVisible = video.state.display;
            const wasAdded = gameState.isVideoAdded(video);
            const recordHide = () => {
                video.state.display = false;

                gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                    video.state.display = prevVisible;
                    // Leaving the stage is half of what a hide did, so undoing it puts the clip back:
                    // stepping back across a hide shows the clip that was there.
                    if (wasAdded && !gameState.isVideoAdded(video)) {
                        gameState.addVideo(video);
                        gameState.stage.update();
                    }
                }, [originalVisible]);
            };

            if (!VideoAction.fades(options)) {
                return this.changeState(gameState, (state) => {
                    recordHide();

                    state.hide();
                    gameState.removeVideo(video);
                    gameState.stage.update();
                }, injection);
            }

            // The clip stays on the stage, `display` true, for the length of the fade: a save taken
            // during it reloads the clip showing and runs this hide again, rather than reloading a
            // stage the fade had not finished clearing.
            return this.changeStateFading(gameState, async (state, signal) => {
                await state.hide(options);
                if (signal.aborted) {
                    return;
                }
                recordHide();
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
        // On the stage, not "the story added it": a clip the preloader warmed is mounted and has
        // a state to talk to, and refusing to talk to it would let warming a clip break a row
        // that worked without it.
        if (!gameState.isVideoOnStage(this.callee)) {
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

    /**
     * {@link changeStateBase} for a fade, which the player can walk away from halfway.
     *
     * Aborting the action - stepping back, loading a save, starting a new game - abandons the fade
     * where it stands, and the element goes back to showing what `video.state.display` says: the undo
     * that follows the abort then decides what that is. The handler is told through `signal`, so the
     * part of it that records the change never runs for a change that did not happen.
     */
    private changeStateFading(
        gameState: GameState,
        handler: (state: ExposedState[ExposedStateType.video], signal: { readonly aborted: boolean }) => Promise<void>,
        injection: ActionExecutionInjection
    ): Awaitable<CalledActionResult> {
        if (!gameState.isVideoOnStage(this.callee)) {
            throw new RuntimeGameError("Video is being used before it is added to the game\nUse video.show() to add the video to the game");
        }

        const video: Video = this.callee;
        const awaitable = new Awaitable<CalledActionResult>();
        const signal = {aborted: false};
        let exposed: ExposedState[ExposedStateType.video] | null = null;
        const token = gameState.getExposedStateAsync<ExposedStateType.video>(video, async (state) => {
            exposed = state;
            await handler(state, signal);
            if (!signal.aborted) {
                awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
            }
        });
        awaitable.registerSkipController(new SkipController(() => {
            signal.aborted = true;
            token.cancel();
            exposed?.cancelFade();
        }));

        return awaitable;
    }

    /** Whether a show or hide was asked to fade, rather than to happen at once. */
    private static fades(options: VideoFadeOptions | undefined): boolean {
        return typeof options?.duration === "number" && options.duration > 0;
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