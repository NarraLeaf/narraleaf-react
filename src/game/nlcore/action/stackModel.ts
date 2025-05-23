import { ArrayValue, Stack } from "@lib/util/data";
import { Awaitable } from "@lib/util/data";
import { GameState, LiveGame } from "../common/game";
import { CalledActionResult, StackModelWaiting } from "../gameTypes";
import { LogicAction } from "./logicAction";


export enum StackModelItemType {
    Action = "action",
    Link = "link",
}

export type StackModelRawData = (
    {
        type: StackModelItemType.Action;
        actionType: string | null;
        action: string | null;
    }
    | {
        type: StackModelItemType.Link;
        actionType: string | null;
        action: string | null;
        stacks: StackModelRawData[];
        stackWaitType: StackModelWaiting["type"] | null;
    }
)[];

/**
 * @fixme: 不要将这段文字提交
 * 
 * Nested Stack Model 是一个全新的概念，旨在控制复杂的嵌套操作的序列化/反序列化
 * 
 * 其保存核心概念是：
 * 1. 不保存无法立即解析的操作，例如Awaitable
 * 2. 如果有一个动作返回了Awaitable，为了防止反序列化后重新执行上一次操作，将该操作存入waitingAction，且在序列化时加入尾栈
 *  - 因此在恢复数据时重新执行尾栈操作会重试这个操作
 *  - Awaitable因为其作用域和复杂的行为，不应该被保存，通过保存其父级操作来代替
 * 3. 如果有一个动作返回了普通子级，也就是同步操作，则加入尾栈
 *  - 在下一次栈操作时会继续这个子级
 * 4. 如果一个动作返回了多个子级，则将这些子级依次加入尾栈
 *  - 这些子级被视为互相调用的关系，例如[a, b]中，a需要等待b执行完毕后继续执行
 *  - 这个操作要求除了栈顶，其他元素**必须**是完全同步操作
 * 5. 如果一个动作返回了StackAction（还未实现），则根据StackAction的定义进行等待
 *  - 这个操作被视为半同步，因为它包含了其子级信息（Awaitable的子级信息只能靠运行后返回）
 *  - 这个操作的序列化机制为：将这个操作视为同步操作，包含其异步信息和栈内的内容
 *  - 当恢复这一个操作时，这个操作依旧在栈顶，并且继续等待其栈内的操作完成
 *  - 这样做，栈内的操作不会在反序列化之后异常重新执行或跳过，而这个栈的保存操作同上
 * 
 * 列举一些情况：
 * 1. 如果一个操作返回了Awaitable
 *  - 这个操作是异步操作，将Awaitable加入尾栈，将这个同步操作设置为waitingAction
 *  - 保存时将Awaitbale排除，将waitingAction加入栈，因此在反序列化时会重试这个操作
 *  - 运行时，这个操作会等待其解析，弹出自身并且将其返回值加入栈
 * 2. 如果一个操作返回了直接子级
 *  - 这个操作是同步操作，将这个操作加入尾栈
 *  - 保存时将这个操作加入栈
 *  - 运行时，这个操作会弹出自身并且将其子级加入栈
 * 3. 如果一个操作返回了多个子级
 *  - 这个操作是否是同步操作基于其返回的最后一个子级决定
 *  - 将所有的子级按照顺序推入栈，确保最后一个子级在栈顶
 *  - 保存时，行为依照上面
 * 4. 如果一个操作返回了StackAction
 *  - 这个操作是半同步操作，将这个操作视为同步操作，包含其异步信息和栈内的内容
 *  - 保存时，该操作包含了其直接子级和等待信息（等待类型例如any, all）和栈
 *  - 运行时，如果栈不为空，则继续等待栈内的操作执行
 *  - 运行时，如果栈为空，则解析该操作，弹出自身并且将其直接子级加入栈
 * 5. 如果一个操作返回了其直接子级，但实际上异步执行了一个StackModel
 *  - 将这个StackModel序列化，并在反序列化时直接执行 
 */

export class StackModel {
    public static isStackModel(action: CalledActionResult | Awaitable<CalledActionResult> | StackModel): action is StackModel {
        return action instanceof StackModel;
    }

    public static createStackModel(gameState: GameState, data: StackModelRawData, actionMap: Map<string, LogicAction.Actions>): StackModel {
        const stackModel = new StackModel(gameState);
        stackModel.deserialize(data, actionMap);
        return stackModel;
    }

    public static isCalledActionResult(action: CalledActionResult | Awaitable<CalledActionResult> | StackModel | undefined): action is CalledActionResult {
        return !!action
            && !this.isStackModel(action)
            && !Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(action)
            && "node" in action
            && "result" in action;
    }

    private stack: Stack<CalledActionResult | Awaitable<CalledActionResult>>;
    private liveGame: LiveGame;
    private waitingAction: CalledActionResult | null = null;
    constructor(public gameState: GameState) {
        this.stack = new Stack<CalledActionResult | Awaitable<CalledActionResult>>().addPushValidator(() => {
            const peek = this.stack.peek();
            // When pushing new item, the peek should not be a waiting action (awaitable/stackModel)
            if (StackModel.isCalledActionResult(peek)) {
                return !peek.wait;
            } else if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)) {
                return peek.isSettled();
            }
            return true;
        });
        this.liveGame = gameState.game.getLiveGame();
    }

    rollNext(): CalledActionResult | StackModel | Awaitable<CalledActionResult> | null {
        // If the action stack is empty
        if (this.stack.isEmpty()) {
            return null;
        }

        // If the action stack is waiting for a result
        const peek = this.stack.peek()!;
        if (
            Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)
            && !peek.isSettled()
        ) {
            return peek;
        }
        if (StackModel.isCalledActionResult(peek) && peek.wait) {
            const stackModels = peek.wait.stackModels;
            if (!stackModels.length) {
                throw new Error("StackModel: Waiting action contains empty stackModels.");
            }
            if (this.isStackModelsAwaiting(peek.wait.type, stackModels)) {
                stackModels.forEach(stack => stack.rollNext());
                return stackModels[0];
            }
        }

        const currentAction = this.stack.pop()!;
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(currentAction)) {
            this.waitingAction = null;

            const result = currentAction.result;
            if (result && result.node?.action) {
                // Push the resolved action into the stack
                this.stack.push(result);
                this.gameState.logger.debug("next action (resolved awaitable)", result.node.action);
                return result;
            }
        } else {
            const executed = this.executeActions(currentAction);
            this.waitingAction = currentAction;
            return executed;
        }

        return null;
    }

    executeActions(result: CalledActionResult): CalledActionResult | Awaitable<CalledActionResult> | null {
        if (!result.node?.action) return null;
        const executed = this.liveGame.executeAction(this.gameState, result.node.action);

        const handleActionResult = (result: CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null) => {
            if (!result) return null;

            if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
                this.gameState.logger.debug("next action (executed awaitable)", result);
                this.stack.push(result);
                return result;
            }

            if (result.node?.action) {
                this.gameState.logger.debug("next action (executed)", result);
                this.stack.push(result);
                return result;
            }

            return null;
        };

        if (Array.isArray(executed)) {
            // return the last item
            let last = null;
            for (const item of executed) {
                const result = handleActionResult(item);
                if (result) last = result;
            }
            return last;
        } else {
            const result = handleActionResult(executed);
            if (result) return result;
        }

        return null;
    }

    isWaiting(): boolean {
        const peek = this.stack.peek();
        if (!peek) return false;

        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)) {
            return !peek.isSettled();
        }

        if (StackModel.isCalledActionResult(peek) && peek.wait) {
            return this.isStackModelsAwaiting(peek.wait.type, peek.wait.stackModels);
        }

        return false;
    }

    isStackModelsAwaiting(type: StackModelWaiting["type"], stackModels: StackModel[]): boolean {
        if (stackModels.length === 0) {
            throw new Error("StackModel: StackModels are empty.");
        }

        // return peek.wait.stackModels.some(stack => stack.isWaiting());
        if (type === "any") {
            // if any stack is NOT waiting, then the stack model is NOT waiting
            return !stackModels.some(stack => !stack.isWaiting());
        } else {
            // if any stack is waiting, then the stack model is waiting
            return stackModels.some(stack => stack.isWaiting());
        }
    }

    serialize(): StackModelRawData {
        const toData = (item: CalledActionResult | Awaitable<CalledActionResult>): ArrayValue<StackModelRawData> | null => {
            if (StackModel.isCalledActionResult(item)) {
                const actionId = item.node?.action?.getId() ?? null;
                const actionType = item.node?.action?.type ?? null;

                if (!actionId) return null;

                if (item.wait?.stackModels) {
                    return {
                        type: StackModelItemType.Link,
                        actionType,
                        action: actionId,
                        stacks: item.wait.stackModels.map(stack => stack.serialize()),
                        stackWaitType: item.wait.type
                    };
                }
                return { type: StackModelItemType.Action, actionType, action: actionId, };
            }
            return null;
        };
        const data = this.stack.map(toData).filter(function (item): item is Exclude<ArrayValue<StackModelRawData> | null, null> {
            return item !== null;
        });
        if (this.waitingAction) {
            const actionData = toData(this.waitingAction);
            if (actionData) {
                data.push(actionData);
            }
        }
        return data;
    }

    reset() {
        this.stack.forEach(item => {
            if (StackModel.isCalledActionResult(item)) {
                item.wait?.stackModels.forEach(stack => stack.reset());
            } else if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(item)) {
                item.abort();
            }
        });
        if (this.waitingAction) {
            this.waitingAction.wait?.stackModels.forEach(stack => stack.reset());
        }
        this.waitingAction = null;
        this.stack.clear();
    }

    deserialize(data: StackModelRawData, actionMap: Map<string, LogicAction.Actions>) {
        this.reset();
        for (const item of data) {
            if (!item.action) continue;

            if (item.type === StackModelItemType.Action) {
                const { actionType, action } = item;
                const found = actionMap.get(action);
                if (!found) {
                    throw new Error(`Action not found: ${action}`);
                }

                this.stack.push({ type: actionType, node: found.contentNode, wait: null });
            } else if (item.type === StackModelItemType.Link) {
                const { actionType, action, stacks, stackWaitType } = item;
                const found = actionMap.get(action);
                if (!found) {
                    throw new Error(`Action not found: ${action}`);
                }
                if (stackWaitType == null) {
                    throw new Error(`Missing stackWaitType for link action: ${action}`);
                }

                this.stack.push({
                    type: actionType, node: found.contentNode, wait: {
                        type: stackWaitType, stackModels: stacks.map(stack => StackModel.createStackModel(this.gameState, stack, actionMap))
                    }
                });
            }
        }
    }

    isEmpty(): boolean {
        return this.stack.isEmpty();
    }
}

