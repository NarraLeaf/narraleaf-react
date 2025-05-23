import { TypedAction } from "@core/action/actions";
import { ControlActionContentType, ControlActionTypes } from "@core/action/actionTypes";
import { LogicAction } from "@core/action/logicAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { Control } from "@core/elements/control";
import { Story } from "@core/elements/story";
import type { CalledActionResult } from "@core/gameTypes";
import { ActionSearchOptions } from "@core/types";
import { Awaitable } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { Timeline } from "@player/Tasks";
import { ExecutedActionResult } from "../action";

export class ControlAction<T extends typeof ControlActionTypes[keyof typeof ControlActionTypes] = typeof ControlActionTypes[keyof typeof ControlActionTypes]>
    extends TypedAction<ControlActionContentType, T, Control> {
    static ActionTypes = ControlActionTypes;

    public static executeActionsAsync(gameState: GameState, action: LogicAction.Actions): Awaitable<void> {
        const stack = gameState.game.getLiveGame().requestStack();
        const awaitable = new Awaitable<void>();
        stack.push(action);

        let currentAwaitable: Awaitable<CalledActionResult> | null = null;

        const roll = async () => {
            while (!stack.isEmpty()) {
                const result = gameState.game.getLiveGame().rollNext(gameState, stack);
                if (result && Awaitable.isAwaitable<CalledActionResult>(result)) {
                    currentAwaitable = result;
                    result.onSkipControllerRegister((controller) => {
                        controller.onAbort(() => {
                            currentAwaitable = null;
                        });
                    });
                    const resolved = await new Promise<CalledActionResult | null>((resolve) => {
                        result.onSettled(() => {
                            resolve(result.result || null);
                        });
                    });
                    if (resolved && resolved.node?.action) {
                        stack.push(resolved.node.action);
                    }
                } else if (result && result.node?.action) {
                    stack.push(result.node.action);
                }
            }
        };
        roll().then(() => {
            awaitable.resolve();
            gameState.game.getLiveGame().removeStack(stack);
        });

        awaitable.onSkipControllerRegister((controller) => {
            controller.onAbort(() => {
                stack.clear();
                if (currentAwaitable) {
                    currentAwaitable.abort();
                }
            });
        });

        return awaitable;
    }

    checkActionChain(actions: LogicAction.Actions[]): LogicAction.Actions[] {
        if (actions.some(action => !!action.contentNode.getChild())) {
            throw new Error("Invalid action chain. Actions are chained unexpectedly.");
        }
        return actions;
    }

    public executeAction(gameState: GameState): ExecutedActionResult {
        const contentNode = this.contentNode as ContentNode<ControlActionContentType[T]>;
        const [content] = contentNode.getContent() as [LogicAction.Actions[]];
        if (this.type === ControlActionTypes.do) {
            return [
                { type: this.type, node: this.contentNode.getChild() },
                { type: this.type, node: content[0].contentNode }
            ];
        } else if (this.type === ControlActionTypes.doAsync) {
            const awaitable = ControlAction.executeActionsAsync(gameState, content[0]);
            gameState.timelines.attachTimeline(awaitable);

            return super.executeAction(gameState);
        } else if (this.type === ControlActionTypes.any) {
            if (content.length === 0) {
                return Awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            }

            const [awaitable, timeline] = Timeline.any(
                this.checkActionChain(content).map(action => ControlAction.executeActionsAsync(gameState, action))
            );
            gameState.timelines.attachTimeline(timeline);

            return Awaitable.forward(awaitable, {
                type: this.type,
                node: this.contentNode.getChild()
            });
        } else if (this.type === ControlActionTypes.all) {
            if (content.length === 0) {
                return Awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            }

            const [awaitable, timeline] = Timeline.all(
                this.checkActionChain(content).map(action => ControlAction.executeActionsAsync(gameState, action))
            );
            gameState.timelines.attachTimeline(timeline);

            return Awaitable.forward(awaitable, {
                type: this.type,
                node: this.contentNode.getChild()
            });
        } else if (this.type === ControlActionTypes.allAsync) {
            const [, timeline] = Timeline.all(
                this.checkActionChain(content).map(action => ControlAction.executeActionsAsync(gameState, action))
            );
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

                const awaitable = ControlAction.executeActionsAsync(gameState, actions[0]);
                gameState.timelines.attachTimeline(awaitable);

                return Awaitable.forward(awaitable, index + 1);
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