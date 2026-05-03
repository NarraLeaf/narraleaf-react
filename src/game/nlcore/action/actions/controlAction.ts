import { TypedAction } from "@core/action/actions";
import { ControlActionContentType, ControlActionTypes } from "@core/action/actionTypes";
import { LogicAction } from "@core/action/logicAction";
import { ContentNode } from "@core/action/tree/actionTree";
import type { Control } from "@core/elements/control";
import { Story } from "@core/elements/story";
import type { CalledActionResult } from "@core/gameTypes";
import { ActionSearchOptions } from "@core/types";
import { Awaitable } from "@lib/util/data";
import { Game } from "@core/common/game";
import { GameState } from "@player/gameState";
import { Timeline } from "@player/Tasks";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { StackModel } from "@core/action/stackModel";

export class ControlAction<T extends typeof ControlActionTypes[keyof typeof ControlActionTypes] = typeof ControlActionTypes[keyof typeof ControlActionTypes]>
    extends TypedAction<ControlActionContentType, T, Control> {
    static ActionTypes = ControlActionTypes;

    public static executeActionsAsync(gameState: GameState, action: LogicAction.Actions): Awaitable<void> {
        const stackModel = gameState.game.getLiveGame().requestAsyncStackModel([{
            type: action.type,
            node: action.contentNode,
        }]);

        return gameState.game.getLiveGame().executeAsyncStackModel(stackModel);
    }

    checkActionChain(actions: LogicAction.Actions[]): LogicAction.Actions[] {
        if (actions.some(action => !!action.contentNode.getChild())) {
            throw new Error("Invalid action chain. Actions are chained unexpectedly.");
        }
        return actions;
    }

    public executeAction(gameState: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
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

            return super.executeAction(gameState, injection);
        } else if (this.type === ControlActionTypes.any) {
            if (content.length === 0) {
                return {
                    type: this.type,
                    node: this.contentNode.getChild()
                };
            }

            const stackModels = this.checkActionChain(content).map(action => {
                return gameState.game.getLiveGame().createStackModel([{
                    type: action.type,
                    node: action.contentNode,
                }]);
            });

            return {
                type: this.type,
                node: this.contentNode.getChild(),
                wait: {
                    type: "any",
                    stackModels
                }
            };
        } else if (this.type === ControlActionTypes.all) {
            if (content.length === 0) {
                return {
                    type: this.type,
                    node: this.contentNode.getChild()
                };
            }

            const stackModels = this.checkActionChain(content).map(action => {
                return gameState.game.getLiveGame().createStackModel([{
                    type: action.type,
                    node: action.contentNode,
                }]);
            });

            return {
                type: this.type,
                node: this.contentNode.getChild(),
                wait: {
                    type: "all",
                    stackModels
                }
            };
        } else if (this.type === ControlActionTypes.allAsync) {
            if (content.length === 0) {
                return {
                    type: this.type,
                    node: this.contentNode.getChild()
                };
            }

            const stackModels = this.checkActionChain(content).map(action => {
                return gameState.game.getLiveGame().requestAsyncStackModel([{
                    type: action.type,
                    node: action.contentNode,
                }]);
            });
            gameState.timelines.attachTimeline(Awaitable.all(...stackModels.map(stackModel => {
                return gameState.game.getLiveGame().executeAsyncStackModel(stackModel);
            })));

            return super.executeAction(gameState, injection);
        } else if (this.type === ControlActionTypes.repeat) {
            const [actions, times] = (this.contentNode as ContentNode<ControlActionContentType["control:repeat"]>).getContent();
            if (times <= 0 || actions.length === 0) {
                return super.executeAction(gameState, injection);
            }

            // Use the new StackModel-based loop
            const loopStackModel = StackModel.createCountLoop(
                gameState.game.getLiveGame(),
                times,
                this.checkActionChain(actions)
            );

            gameState.logger.debug("ControlAction", "repeat", actions, times);

            return {
                type: this.type,
                node: this.contentNode.getChild(),
                wait: {
                    type: "all",
                    stackModels: [loopStackModel]
                }
            };
        } else if (this.type === ControlActionTypes.while) {
            const [actions, condition] = (this.contentNode as ContentNode<ControlActionContentType["control:while"]>).getContent();
            if (actions.length === 0) {
                return super.executeAction(gameState, injection);
            }

            // Check condition before starting
            if (!condition.evaluate({ gameState }).value) {
                return super.executeAction(gameState, injection);
            }

            // Use the new StackModel-based condition loop
            const loopStackModel = StackModel.createConditionLoop(
                gameState.game.getLiveGame(),
                condition,
                this.getId(),
                this.checkActionChain(actions)
            );

            gameState.logger.debug("ControlAction", "while", actions);

            return {
                type: this.type,
                node: this.contentNode.getChild(),
                wait: {
                    type: "all",
                    stackModels: [loopStackModel]
                }
            };
        } else if (this.type === ControlActionTypes.break) {
            // Break the current loop in the StackModel
            if (!injection.stackModel.isLoop()) {
                throw new Error("Control.breakLoop() can only be used inside a loop (repeat/while)");
            }
            injection.stackModel.breakLoop();

            // Return immediately without continuing to the child
            return {
                type: this.type,
                node: null
            };
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
            });

            awaitable.onSkipControllerRegister(controller => {
                controller.onAbort(() => {
                    timeline.abort();
                });
            });

            return awaitable;
        } else if (this.type === ControlActionTypes.waitForClick) {
            if (gameState.consumeStageClick()) {
                return {
                    type: this.type,
                    node: this.contentNode.getChild()
                };
            }
            const awaitable = new Awaitable<CalledActionResult>();
            const clickAwaitable = new Awaitable<void>();
            const timeline = new Timeline(clickAwaitable);
            gameState.timelines.attachTimeline(timeline);

            const preference = gameState.game.preference;
            const autoForward = preference.getPreference(Game.Preferences.autoForward);
            const gameSpeed = preference.getPreference(Game.Preferences.gameSpeed);
            const autoForwardDelay = autoForward
                ? gameState.game.config.autoForwardDelay / gameSpeed
                : null;

            let settled = false;
            let autoForwardTimer: ReturnType<typeof setTimeout> | null = null;
            let stageToken: { cancel: () => void } | null = null;
            let skipToken: { cancel: () => void } | null = null;

            const cleanup = () => {
                stageToken?.cancel();
                skipToken?.cancel();
                if (autoForwardTimer) {
                    clearTimeout(autoForwardTimer);
                    autoForwardTimer = null;
                }
            };

            const finalize = () => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                clickAwaitable.resolve();
            };

            stageToken = gameState.events.on(GameState.EventTypes["event:state.player.stageClick"], finalize);
            skipToken = gameState.events.on(GameState.EventTypes["event:state.player.skip"], finalize);

            if (autoForwardDelay !== null) {
                autoForwardTimer = setTimeout(finalize, autoForwardDelay);
            }

            clickAwaitable.then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            });

            awaitable.onSkipControllerRegister(controller => {
                controller.onAbort(() => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
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

        // break and waitForClick have no body actions
        if (this.type === ControlActionTypes.break || this.type === ControlActionTypes.waitForClick) {
            return super.getFutureActions(story, options);
        }

        const actions = this.contentNode.getContent()[0] as LogicAction.Actions[] | undefined;
        const childActions = super.getFutureActions(story, options);
        return [...(actions ?? []), ...childActions];
    }

    stringify(story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        // break and waitForClick have no body actions
        if (this.type === ControlActionTypes.break) {
            return super.stringifyWithContent("Control", "break");
        }
        if (this.type === ControlActionTypes.waitForClick) {
            return super.stringifyWithContent("Control", "waitForClick");
        }

        const contentNode = this.contentNode as ContentNode<ControlActionContentType[T]>;
        const [content] = contentNode.getContent() as [LogicAction.Actions[]];

        return super.stringifyWithContent("Control", content.map(action => action.stringify(story, _seen, _strict)).join(";"));
    }
}