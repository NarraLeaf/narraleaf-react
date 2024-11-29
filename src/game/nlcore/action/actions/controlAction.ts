import {ControlActionContentType, ControlActionTypes} from "@core/action/actionTypes";
import {Control} from "@core/elements/control";
import {GameState} from "@player/gameState";
import {LogicAction} from "@core/action/logicAction";
import {Awaitable} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";

export class ControlAction<T extends typeof ControlActionTypes[keyof typeof ControlActionTypes] = typeof ControlActionTypes[keyof typeof ControlActionTypes]>
    extends TypedAction<ControlActionContentType, T, Control> {
    static ActionTypes = ControlActionTypes;

    /**
     * Execute all actions in the content node
     * will wait for awaitable actions to resolve
     */
    public async executeAllActions(state: GameState, action: LogicAction.Actions) {
        const exited = false;
        let current: LogicAction.Actions | null = action;
        while (!exited && current) {
            const next = state.game.getLiveGame().executeAction(state, current);

            state.logger.debug("Control - Next Action", next);

            if (!next) {
                break;
            }
            if (Awaitable.isAwaitable(next)) {
                const {node} = await new Promise<CalledActionResult>((r) => {
                    next.then((_) => r(next.result as any));
                });
                if (node) {
                    current = node.action;
                } else {
                    break;
                }
            } else {
                current = next as LogicAction.Actions;
            }
        }
    }

    public async executeSingleAction(state: GameState, action: LogicAction.Actions) {
        const next = state.game.getLiveGame().executeAction(state, action);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(next)) {
            const {node} = await new Promise<CalledActionResult>((r) => {
                next.then((_) => r(next.result as any));
            });
            return node;
        } else {
            return next;
        }
    }

    public execute(state: GameState, awaitable: Awaitable<any, any>, content: LogicAction.Actions[]) {
        if (content.length > 0) {
            this.executeAllActions(state, content[0])
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

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> {
        const contentNode = this.contentNode as ContentNode<ControlActionContentType[T]>;
        const [content] = contentNode.getContent() as [LogicAction.Actions[]];
        if (this.type === ControlActionTypes.do) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            return this.execute(state, awaitable, content);
        } else if (this.type === ControlActionTypes.doAsync) {
            (async () => {
                if (content.length > 0) {
                    await this.executeAllActions(state, content[0]);
                }
            })();
            return super.executeAction(state);
        } else if (this.type === ControlActionTypes.any) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            const promises = content.map(action => this.executeSingleAction(state, action));
            Promise.any(promises).then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === ControlActionTypes.all) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            (async () => {
                await Promise.all(content.map(action => this.executeSingleAction(state, action)));
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            })();
            return awaitable;
        } else if (this.type === ControlActionTypes.allAsync) {
            (async () => {
                for (const action of content) {
                    this.executeSingleAction(state, action).then(_ => (void 0));
                }
            })();
            return super.executeAction(state);
        } else if (this.type === ControlActionTypes.repeat) {
            const [actions, times] =
                (this.contentNode as ContentNode<ControlActionContentType["control:repeat"]>).getContent();
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            (async () => {
                for (let i = 0; i < times; i++) {
                    if (actions.length > 0) {
                        await this.executeAllActions(state, actions[0]);
                    }
                }
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
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
                state.stage.next();
            });
            return awaitable;
        }

        throw new Error("Unknown control action type: " + this.type);
    }

    getFutureActions(story: Story): LogicAction.Actions[] {
        const actions = this.contentNode.getContent()[0];
        const childActions = super.getFutureActions(story);
        return [...actions, ...childActions];
    }
}