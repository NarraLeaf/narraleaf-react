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
     * @deprecated use attachTasks instead
     *
     * Execute all actions in the content node
     * will wait for awaitable actions to resolve
     */
    public async executeAllActions_(state: GameState, action: LogicAction.Actions, awaitable: Awaitable<any>) {
        let exited = false, current: LogicAction.Actions | null = action;
        let currentAwaiting: Awaitable<any> | null = null;

        const abort = () => {
            exited = true;
            currentAwaiting?.abort();
        };
        awaitable.registerSkipController(new SkipController(abort));

        while (!exited && current) {
            const next = state.game.getLiveGame().executeAction(state, current);
            currentAwaiting = null;

            state.logger.debug("Control - Next Action", next);

            if (!next) {
                break;
            }
            if (Awaitable.isAwaitable(next)) {
                currentAwaiting = next;
                const result = await new Promise<CalledActionResult | null>((r) => {
                    next.then((_) => r(next.result as any));
                    next.skipController?.onAbort(() => {
                        r(null);
                    });
                });
                if (result && result.node) {
                    current = result.node.action;
                } else {
                    break;
                }
            } else {
                current = next as LogicAction.Actions;
            }
        }
    }

    /**
     * Perform an action and all its children. Due to bidirectional bubbling, the Awaitable interrupt returned by the function affects the children who're executing.
     *
     * At the same time, the child interrupt will bubble up to the Awaitable returned by this function and interrupt the execution of the Timeline.
     * This is because all later results of this function depend on the previous result, so it isn't possible to silently ignore interrupted sub operations.
     */
    public executeActionSeries<T>(
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

            if (!next) return null;
            else if (Awaitable.isAwaitable<CalledActionResult>(next)) return next;
            else return Awaitable.resolve(next);
        }, {
            type: action.type,
            node: action.contentNode
        });
        const timeline = new Timeline(execProxy);
        const awaitable = new Awaitable<T>();

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

    /**
     * @deprecated use executeSingleAction instead
     */
    public executeSingleAction_(state: GameState, action: LogicAction.Actions): Promise<ContentNode | null> {
        const next = state.game.getLiveGame().executeAction(state, action);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(next)) {
            return new Promise<ContentNode | null>((r) => {
                next.then((_) => {
                    state.logger.debug("Control - Next Action (single)", next);
                    r(next.result?.node || null);
                });
            });
        } else {
            return Promise.resolve(next?.contentNode || null);
        }
    }

    public executeSingleAction(state: GameState, action: LogicAction.Actions): Awaitable<CalledActionResult> | LogicAction.Actions | null {
        const next = state.game.getLiveGame().executeAction(state, action);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(next)) {
            return next;
        } else {
            return next;
        }
    }

    public execute(state: GameState, awaitable: Awaitable<any, any>, content: LogicAction.Actions[]) {
        if (content.length > 0) {
            this.executeAllActions_(state, content[0], awaitable)
                .then(() => {
                    awaitable.resolve({
                        type: this.type,
                        node: this.contentNode.getChild()
                    });
                    state.stage.next();
                });
            return awaitable;
        } else {
            return super.executeAction(state);
        }
    }

    public executeAction(gameState: GameState): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> {
        const contentNode = this.contentNode as ContentNode<ControlActionContentType[T]>;
        const [content] = contentNode.getContent() as [LogicAction.Actions[]];
        if (this.type === ControlActionTypes.do) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            return this.execute(gameState, awaitable, content);
        } else if (this.type === ControlActionTypes.doAsync) {
            if (content.length > 0) {
                const [, timeline] = this.executeActionSeries(gameState, content[0], (result) => result);
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
            gameState.timelines.attachTimeline(timeline.setGuard(gameState.guard));

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
            gameState.timelines.attachTimeline(timeline.setGuard(gameState.guard));

            return awaitable;
        } else if (this.type === ControlActionTypes.allAsync) {
            const [, timeline] = Timeline.proxy<void>(voidFunction());

            for (const item of content) {
                const result = this.executeSingleAction(gameState, item);
                if (Awaitable.isAwaitable<CalledActionResult>(result)) {
                    timeline.attachChild(result);
                }
            }
            gameState.timelines.attachTimeline(timeline.setGuard(gameState.guard));

            return super.executeAction(gameState);
        } else if (this.type === ControlActionTypes.repeat) {
            const [actions, times] =
                (this.contentNode as ContentNode<ControlActionContentType["control:repeat"]>).getContent();
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            (async () => {
                for (let i = 0; i < times; i++) {
                    if (actions.length > 0) {
                        await this.executeAllActions_(gameState, actions[0], awaitable);
                    }
                }
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                gameState.stage.next();
            })();
            return awaitable;
        } else if (this.type === ControlActionTypes.sleep) {
            const awaitable = new Awaitable<CalledActionResult, any>(v => v);
            const [, content] = (this.contentNode as ContentNode<[never[], number | Awaitable<any> | Promise<any>]>).getContent();
            const wait = new Promise<void>(resolve => {
                if (typeof content === "number") {
                    setTimeout(() => {
                        resolve();
                    }, content);
                } else if (Awaitable.isAwaitable<any, any>(content)) {
                    content.then(resolve);
                } else {
                    content?.then(resolve);
                }
            });
            wait.then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                gameState.stage.next();
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