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
import { StackModel, StackModelRawData } from "@core/action/stackModel";
import { RuntimeInternalError } from "@core/common/Utils";

export class ControlAction<T extends typeof ControlActionTypes[keyof typeof ControlActionTypes] = typeof ControlActionTypes[keyof typeof ControlActionTypes]>
    extends TypedAction<ControlActionContentType, T, Control> {
    static ActionTypes = ControlActionTypes;

    /**
     * Jump target resolved at story-construction time (see {@link Scene.constructLabels}).
     * Only set on `control:jump` actions; the target is the `control:label` action to resume at.
     * @internal
     */
    private _jumpTarget: LogicAction.Actions | null = null;

    /**@internal */
    setJumpTarget(target: LogicAction.Actions): this {
        this._jumpTarget = target;
        return this;
    }

    /**@internal */
    getJumpTarget(): LogicAction.Actions | null {
        return this._jumpTarget;
    }

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
            if (content.length === 0) {
                return { type: this.type, node: this.contentNode.getChild() };
            }
            return [
                { type: this.type, node: this.contentNode.getChild() },
                { type: this.type, node: content[0].contentNode }
            ];
        } else if (this.type === ControlActionTypes.doAsync) {
            if (content.length === 0) {
                return super.executeAction(gameState, injection);
            }
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

            // During fast-forward, timed pauses resolve immediately so "skip to next choice"
            // is not held up by scripted delays.
            if (gameState.isFastForwarding()) {
                return {
                    type: this.type,
                    node: this.contentNode.getChild()
                };
            }

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
        } else if (this.type === ControlActionTypes.label) {
            // A label is an invisible marker: it just passes through to the next action.
            return super.executeAction(gameState, injection);
        } else if (this.type === ControlActionTypes.jump) {
            // In-scene jump. Mirrors scene:jumpTo (clear the stack, push the target node), but
            // stays inside the current scene — nothing is unloaded or re-initialized, only the play
            // head moves. The target is resolved once at construction (Scene.constructLabels).
            //
            // Cleared down to the innermost scene-call return address rather than to the bottom.
            // A label is scene-scoped, so a `/goto` inside a called scene is a move within that
            // scene and has no business dropping the frame that returns to whatever called it.
            // With no call open the two are the same thing.
            const target = this._jumpTarget;
            if (!target) {
                const [name] = (this.contentNode as ContentNode<ControlActionContentType["control:jump"]>).getContent();
                throw new RuntimeInternalError(`Jump target label "${name}" was not resolved. `
                    + "This usually means the story was not constructed before playing.");
            }

            const liveGame = gameState.getLiveGame();
            const stackSnapshot = liveGame.getStackModelForce().serialize();
            gameState.actionHistory.push<[StackModelRawData]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevStackSnapshot) => {
                const [actionMaps] = liveGame.constructMaps();
                liveGame.getStackModelForce().deserialize(prevStackSnapshot, actionMaps);
            }, [stackSnapshot]);

            liveGame
                .getStackModelForce()
                .clearAboveCallFrame()
                .push({
                    type: this.type,
                    node: target.contentNode
                });

            return null;
        }

        throw new Error("Unknown control action type: " + this.type);
    }

    getFutureActions(story: Story, options: ActionSearchOptions): LogicAction.Actions[] {
        if (this.callee.config.allowFutureScene === false && options.allowFutureScene === false) {
            return [...super.getFutureActions(story, options)];
        }

        // break/waitForClick have no body actions; label/jump carry a name string, not actions.
        // A jump deliberately does NOT expand its target here — the target is reachable through the
        // normal child chain, and following it would let backward jumps cycle the static walkers.
        if (
            this.type === ControlActionTypes.break
            || this.type === ControlActionTypes.waitForClick
            || this.type === ControlActionTypes.label
            || this.type === ControlActionTypes.jump
        ) {
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
        // label/jump carry a name string rather than a body of actions
        if (this.type === ControlActionTypes.label || this.type === ControlActionTypes.jump) {
            const [name] = this.contentNode.getContent() as [string];
            const verb = this.type === ControlActionTypes.label ? "label" : "jump";
            return super.stringifyWithContent("Control", `${verb}(${name})`);
        }

        const contentNode = this.contentNode as ContentNode<ControlActionContentType[T]>;
        const [content] = contentNode.getContent() as [LogicAction.Actions[]];

        return super.stringifyWithContent("Control", content.map(action => action.stringify(story, _seen, _strict)).join(";"));
    }
}