import {ControlActionContentType, ControlActionTypes} from "@core/action/actionTypes";
import {Control} from "@core/elements/control";
import {GameState} from "@player/gameState";
import {LogicAction} from "@core/action/logicAction";
import {Awaitable, SkipController, voidFunction} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";
import {ActionSearchOptions} from "@core/types";
import {Timeline} from "@player/Tasks";

export class ControlAction<T extends typeof ControlActionTypes[keyof typeof ControlActionTypes] = typeof ControlActionTypes[keyof typeof ControlActionTypes]>
    extends TypedAction<ControlActionContentType, T, Control> {
    static ActionTypes = ControlActionTypes;

    /**
     * Perform an action and all its children. Due to bidirectional bubbling, the Awaitable interrupt returned by the function affects the children who're executing.
     *
     * At the same time, the child interrupt will bubble up to the Awaitable returned by this function and interrupt the execution of the Timeline.
     * This is because all later results of this function depend on the previous result, so it isn't possible to silently ignore interrupted sub operations.
     *
     * @template T The type of the result returned by the onResolved callback.
     * @param {GameState} gameState - The current game state.
     * @param {LogicAction.Actions} action - The action to be executed.
     * @param {function(CalledActionResult): T} onResolved - A callback function that processes the result of the action. The awaitable will be resolved to the value returned by this callback.
     * @returns {[Awaitable<T>, Timeline]} A tuple containing the Awaitable and the Timeline.
     */
    public static executeActionSeries<T>(
        gameState: GameState,
        action: LogicAction.Actions,
        onResolved: (result: CalledActionResult) => T
    ): [awaitable: Awaitable<T>, timeline: Timeline] {
        const execProxy = Timeline.sequence<CalledActionResult>((prev) => {
            if (!prev.node || !prev.node.action) {
                return null;
            }
            const current = prev.node.action;
            const next = gameState.game.getLiveGame().executeActionRaw(gameState, current);

            gameState.logger.debug("ControlAction", "executeActionSeries (seq)", current.type, next);

            if (!next) return null;
            else if (Awaitable.isAwaitable<CalledActionResult>(next)) return next;
            else return Awaitable.resolve(next);
        }, {
            type: action.type,
            node: action.contentNode
        });
        const timeline = new Timeline(execProxy);
        const awaitable: Awaitable<T> = new Awaitable<T>();

        gameState.logger.debug("ControlAction", "executeActionSeries", action.type, action.contentNode);

        execProxy.then((value) => {
            const result = onResolved(value);
            awaitable.resolve(result);
        });
        execProxy.registerSkipController(new SkipController(() => {
            timeline.abort();
            awaitable.abort();
        }));
        awaitable.onSkipControllerRegister((controller) => {
            controller.onAbort(() => {
                timeline.abort();
            });
        });

        return [awaitable, timeline];
    }

    public executeSingleAction(gameState: GameState, action: LogicAction.Actions): Awaitable<CalledActionResult> | LogicAction.Actions | null {
        const next = gameState.game.getLiveGame().executeAction(gameState, action);

        gameState.logger.debug("ControlAction", "executeSingleAction", action.type, next);

        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(next)) {
            return next;
        } else {
            return next;
        }
    }

    public executeAction(gameState: GameState): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> {
        const contentNode = this.contentNode as ContentNode<ControlActionContentType[T]>;
        const [content] = contentNode.getContent() as [LogicAction.Actions[]];
        if (this.type === ControlActionTypes.do) {
            const [awaitable, timeline] = ControlAction.executeActionSeries(gameState, content[0], (result) => result);
            gameState.timelines.attachTimeline(timeline);

            return Awaitable.forward(awaitable, {
                type: this.type,
                node: this.contentNode.getChild(),
            });
        } else if (this.type === ControlActionTypes.doAsync) {
            if (content.length > 0) {
                const [, timeline] = ControlAction.executeActionSeries(gameState, content[0], (result) => result);
                gameState.timelines.attachTimeline(timeline);
            }

            return super.executeAction(gameState);
        } else if (this.type === ControlActionTypes.any) {
            if (content.length === 0) {
                return Awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            }

            const [awaitable, timeline] = Timeline.any(
                content
                    .map(action => this.executeSingleAction(gameState, action))
                    .filter((v): v is Awaitable<CalledActionResult> => Awaitable.isAwaitable<CalledActionResult>(v))
            );
            gameState.timelines.attachTimeline(timeline);

            return Awaitable.forward(awaitable, {
                type: this.type,
                node: this.contentNode.getChild()
            });
        } else if (this.type === ControlActionTypes.all) {
            const [awaitable, timeline] = Timeline.proxy<CalledActionResult>(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                gameState.stage.next();
            });
            for (const item of content) {
                const result = this.executeSingleAction(gameState, item);
                if (Awaitable.isAwaitable<CalledActionResult>(result)) {
                    timeline.attachChild(result);
                }
            }
            gameState.timelines.attachTimeline(timeline);

            return awaitable;
        } else if (this.type === ControlActionTypes.allAsync) {
            const [, timeline] = Timeline.proxy<void>(voidFunction());

            for (const item of content) {
                const result = this.executeSingleAction(gameState, item);
                if (Awaitable.isAwaitable<CalledActionResult>(result)) {
                    timeline.attachChild(result);
                }
            }
            gameState.timelines.attachTimeline(timeline);

            return super.executeAction(gameState);
        } else if (this.type === ControlActionTypes.repeat) {
            const [actions, times] = (this.contentNode as ContentNode<ControlActionContentType["control:repeat"]>).getContent();
            if (times <= 0) {
                return super.executeAction(gameState);
            }

            const awaitable = Timeline.sequence<number>((index) => {
                if (index >= times) {
                    return null;
                }

                const [awaitable, tl] = ControlAction.executeActionSeries(gameState, actions[0], () => index + 1);
                gameState.timelines.attachTimeline(tl);

                gameState.logger.debug("ControlAction", "repeat", actions, times, index, awaitable);

                return awaitable;
            }, 0);

            gameState.logger.debug("ControlAction", "repeat", actions, times);

            return Awaitable.forward<CalledActionResult>(awaitable, {
                type: this.type,
                node: this.contentNode.getChild(),
            });
        } else if (this.type === ControlActionTypes.sleep) {
            const [, content] = (this.contentNode as ContentNode<ControlActionContentType["control:sleep"]>).getContent();
            let sleepAwaitable: Awaitable<void>;

            if (typeof content === "number") {
                sleepAwaitable = Awaitable.delay(content);
            } else if (Awaitable.isAwaitable<void>(content)) {
                sleepAwaitable = content;
            } else {
                sleepAwaitable = Awaitable.fromPromise(content as Promise<any>);
            }

            const awaitable = new Awaitable<CalledActionResult>();
            const timeline = new Timeline(sleepAwaitable);
            gameState.timelines.attachTimeline(timeline);

            sleepAwaitable.then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                gameState.stage.next();
            });

            awaitable.onSkipControllerRegister(controller => {
                controller.onAbort(() => {
                    timeline.abort();
                });
            });

            return awaitable;
        }

        throw new Error("Unknown control action type: " + this.type);
    }

    getFutureActions(story: Story, options: ActionSearchOptions): LogicAction.Actions[] {
        if (this.callee.config.allowFutureScene === false && options.allowFutureScene === false) {
            return [...super.getFutureActions(story, options)];
        }

        const actions = this.contentNode.getContent()[0];
        const childActions = super.getFutureActions(story, options);
        return [...actions, ...childActions];
    }
}