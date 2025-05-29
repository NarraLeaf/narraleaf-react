import { ArrayValue, Awaitable, Stack } from "@lib/util/data";
import { LiveGame } from "../common/game";
import { RuntimeInternalError } from "../common/Utils";
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
 * Nested Stack Model is a new concept designed to control serialization/deserialization of complex nested operations
 * 
 * Core concepts for saving state:
 * 1. Do not save operations that cannot be immediately resolved, such as Awaitables
 * 2. If an action returns an Awaitable, to prevent re-execution of the previous operation after deserialization:
 *    - Store the operation in waitingAction and add it to the tail stack during serialization
 *    - When restoring data, retrying the tail stack operation will retry this operation
 *    - Awaitables should not be saved due to their scope and complex behavior, instead save their parent operation
 * 3. If an action returns a regular child (synchronous operation), add it to the tail stack
 *    - The child will continue on the next stack operation
 * 4. If an action returns multiple children, add them sequentially to the tail stack
 *    - These children are treated as having a call relationship, e.g. in [a,b], a waits for b to complete before continuing
 *    - This requires all elements except the stack top to be fully synchronous operations
 * 5. If an action returns a StackAction (not yet implemented), wait according to the StackAction definition
 *    - This operation is considered semi-synchronous since it contains child information
 *    - Serialization mechanism: treat as synchronous operation, including async info and stack contents
 *    - When restored, operation remains at stack top and continues waiting for stack operations to complete
 *    - This ensures stack operations are not abnormally re-executed or skipped after deserialization
 * 
 * Example scenarios:
 * 1. Action returns Awaitable:
 *    - Async operation: add Awaitable to tail stack, set sync operation as waitingAction
 *    - During save: exclude Awaitable, add waitingAction to stack for retry on deserialize
 *    - During runtime: wait for resolution, pop self and add return value to stack
 * 2. Action returns direct child:
 *    - Sync operation: add operation to tail stack
 *    - During save: add operation to stack
 *    - During runtime: pop self and add child to stack
 * 3. Action returns multiple children:
 *    - Sync/async nature determined by last child
 *    - Push all children to stack in order, last child on top
 *    - Save behavior follows above rules
 * 4. Action returns StackAction:
 *    - Semi-sync operation treated as sync, includes async info and stack contents
 *    - During save: includes direct children, wait info (type e.g. any, all) and stack
 *    - Runtime with non-empty stack: continue waiting for stack operations
 *    - Runtime with empty stack: resolve operation, pop self and add direct children
 * 5. Action returns direct child but async executes StackModel:
 *    - Serialize StackModel and execute directly on deserialize
 */

export class StackModel {
    public static isStackModel(action: CalledActionResult | Awaitable<CalledActionResult> | StackModel): action is StackModel {
        return action instanceof StackModel;
    }

    public static createStackModel(liveGame: LiveGame, data: StackModelRawData, actionMap: Map<string, LogicAction.Actions>): StackModel {
        const stackModel = new StackModel(liveGame);
        stackModel.deserialize(data, actionMap);
        return stackModel;
    }

    public static isCalledActionResult(action: CalledActionResult | Awaitable<CalledActionResult> | StackModel | undefined | null): action is CalledActionResult {
        return !!action
            && !this.isStackModel(action)
            && !Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(action)
            && "node" in action
            && "type" in action;
    }

    public static fromAction(action: LogicAction.Actions): CalledActionResult {
        return {
            type: action.type,
            node: action.contentNode,
        };
    }

    public static executeStackModelGroup(type: StackModelWaiting["type"], stackModels: StackModel[]): Awaitable<void> {
        if (type === "any") {
            return Awaitable.any(...stackModels.map(stack => stack.execute()));
        } else {
            return Awaitable.all(...stackModels.map(stack => stack.execute()));
        }
    }

    private stack: Stack<CalledActionResult | Awaitable<CalledActionResult>>;
    private waitingAction: CalledActionResult | null = null;
    constructor(private liveGame: LiveGame) {
        this.stack = new Stack<CalledActionResult | Awaitable<CalledActionResult>>().addPushValidator((item) => {
            const peek = this.stack.peek();

            // When pushing new item, the peek should not be the same as the item
            if (item === peek) {
                throw new RuntimeInternalError("StackModel: Unexpected self-push in stack.");
            }

            // When pushing new item, the peek should not be a waiting action (awaitable/stackModel)
            if (StackModel.isCalledActionResult(peek)) {
                if (peek.wait) {
                    throw new RuntimeInternalError("StackModel: Unexpected waiting action in stack. (is calledActionResult: true, wait: true)");
                }
            } else if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)) {
                if (!peek.isSettled()) {
                    throw new RuntimeInternalError("StackModel: Unexpected unsettled Awaitable in stack.");
                }
            }

            // When pushing new item, the item should be a CalledActionResult or Awaitable
            if (
                !StackModel.isCalledActionResult(item)
                && !Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(item)
            ) {
                throw new RuntimeInternalError("StackModel: Unexpected non-CalledActionResult or Awaitable in stack.");
            }
            return true;
        });
    }

    /**
     * Executes the next operation in the stack
     * 
     * Main responsibilities:
     * 1. Check and handle waiting states at the top of the stack
     * 2. Execute current operation and handle its results
     * 3. Manage asynchronous operations and nested stack models
     * 
     * Execution flow:
     * 1. If stack is empty, return null
     * 2. Check top element:
     *    - If it's an unsettled Awaitable, return the Awaitable
     *    - If it's a waiting operation (with nested stack models), check nested stack status
     * 3. Pop and execute current operation:
     *    - If it's an Awaitable, wait for completion and handle result
     *    - If it's a regular operation, execute and handle return value
     * 
     * @returns One of the following:
     * - CalledActionResult: Execution result (returned a synchronous operation)
     * - Awaitable<CalledActionResult>: Asynchronous operation
     * - null: No more operations if the stack is empty, or the top element is exited
     */
    rollNext(): CalledActionResult | Awaitable<CalledActionResult> | null {
        // Return null if the action stack is empty
        if (this.stack.isEmpty()) {
            return null;
        }

        // Check the status of the top element
        const peek = this.stack.peek()!;
        // If top element is an unsettled Awaitable, return it directly
        if (
            Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)
            && !peek.isSettled()
        ) {
            return peek;
        }
        // If top element is a waiting operation (with nested stack models)
        if (StackModel.isCalledActionResult(peek) && peek.wait) {
            const stackModels = peek.wait.stackModels;
            if (!stackModels.length) {
                throw new Error("StackModel: Waiting action contains empty stackModels.");
            }
            if (this.isStackModelsAwaiting(peek.wait.type, stackModels)) {
                stackModels.forEach(stack => stack.rollNext());
                return peek;
            }
        }

        // Reset waiting action
        this.waitingAction = null;

        // Pop and execute current operation
        const currentAction = this.stack.pop()!;
        // Handle Awaitable type result
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(currentAction)) {

            const result = currentAction.result;
            if (result && result.node?.action) {
                // Push the resolved action into the stack
                this.stack.push(result);
                this.liveGame.getGameStateForce().logger.debug("next action (resolved awaitable)", result.node.action);
                return result;
            }
        } else {
            // Execute regular operation and handle result
            const executed = this.executeActions(currentAction);
            this.waitingAction = currentAction;

            return executed;
        }

        return null;
    }

    public execute(): Awaitable<void> {
        const awaitable = new Awaitable<void>();

        let currentWaiting: Awaitable | null = null,
            exited = false;

        const roll = async () => {
            let count = 0;
            while (!exited) {
                if (count++ > this.liveGame.getGameStateForce().game.config.maxStackModelLoop) {
                    throw new Error("StackModel: Suspiciously long waiting loop.");
                }

                if (this.stack.isEmpty()) {
                    exited = true;
                    break;
                }

                const result: CalledActionResult | Awaitable<CalledActionResult> | null = this.rollNext();
                if (!result) {
                    continue;
                }
                if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
                    if (result.isSettled()) {
                        continue;
                    } else {
                        currentWaiting = result;
                        await result;
                    }
                } else if (StackModel.isCalledActionResult(result)) {
                    if (result.wait) {
                        currentWaiting = StackModel.executeStackModelGroup(result.wait.type, result.wait.stackModels);
                        await currentWaiting;
                    } else {
                        continue;
                    }
                }
            }
        };

        roll().then(() => awaitable.resolve());
        awaitable.onSkipControllerRegister((skipController) => {
            skipController.onAbort(() => {
                if (currentWaiting) {
                    exited = true;
                    currentWaiting.abort();
                }
            });
        });
        return awaitable;
    }

    public abortStackTop(): void {
        if (this.stack.isEmpty()) {
            return;
        }
        const peek = this.stack.peek();
        if (peek && Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)) {
            (this.stack.pop() as Awaitable<CalledActionResult>).abort();
        }
    }

    public getTopSync(): CalledActionResult | null {
        if (this.stack.isEmpty()) {
            return null;
        }
        let tried: boolean = false;
        for (let i = this.stack.size() - 1; i >= 0; i--) {
            const peek = this.stack.get(i);
            if (peek) {
                if (StackModel.isCalledActionResult(peek)) {
                    return peek;
                }
                if (tried) {
                    throw new RuntimeInternalError("StackModel: Unexpected non-CalledActionResult in stack.");
                }
            } else {
                return null;
            }
            tried = true;
        }
        return null;
    }

    executeActions(result: CalledActionResult): CalledActionResult | Awaitable<CalledActionResult> | null {
        if (!result.node?.action) return null;
        const executed = this.liveGame.executeAction(this.liveGame.getGameStateForce(), result.node.action);

        const handleActionResult = (result: CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null) => {
            if (!result) return null;

            if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
                this.liveGame.getGameStateForce().logger.debug("next action (executed awaitable)", result);
                this.stack.push(result);
                return result;
            }

            if (result.node?.action) {
                this.liveGame.getGameStateForce().logger.debug("next action (executed)", result);
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

    deserialize(data: StackModelRawData, actionMap: Map<string, LogicAction.Actions>): this {
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
                        type: stackWaitType, stackModels: stacks.map(stack => StackModel.createStackModel(this.liveGame, stack, actionMap))
                    }
                });
            }
        }
        
        return this;
    }

    isEmpty(): boolean {
        return this.stack.isEmpty();
    }

    push(...items: (CalledActionResult | Awaitable<CalledActionResult>)[]): this {
        this.stack.push(...items);
        return this;
    }
}

