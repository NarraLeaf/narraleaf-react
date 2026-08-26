import { Awaitable, SkipController, Stack } from "@lib/util/data";
import { LiveGame } from "../common/game";
import { RuntimeInternalError, RuntimeGameError } from "../common/Utils";
import { CalledActionResult, StackModelWaiting } from "../gameTypes";
import { LogicAction } from "./logicAction";
import { Lambda } from "@core/elements/condition";
import { GameState } from "@player/gameState";


export enum StackModelItemType {
    Action = "action",
    Link = "link",
}

/**
 * Loop type for StackModel
 * - count: repeat N times
 * - condition: while condition is true
 */
export type StackModelLoopType = "count" | "condition";

/**
 * Loop configuration for StackModel
 */
export type StackModelLoopConfig = {
    type: StackModelLoopType;
    /** Current iteration count (0-based) */
    counter: number;
    /** Max iterations (count loop only) */
    limit?: number;
    /** Action ID containing the condition Lambda (condition loop only, for deserialization) */
    conditionActionId?: string;
    /** Action IDs for the loop body (for deserialization) */
    bodyActionIds: string[];
    /** Whether the loop has been broken */
    broken: boolean;
};

/**
 * Serialized loop configuration
 */
export type StackModelLoopRawData = {
    type: StackModelLoopType;
    counter: number;
    limit?: number;
    conditionActionId?: string;
    bodyActionIds: string[];
    broken: boolean;
};

/**
 * Stack item data for serialization
 */
export type StackModelItemData =
    | {
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
    };

/**
 * Serialized StackModel data with loop support
 */
export type StackModelRawData = {
    items: StackModelItemData[];
    loop?: StackModelLoopRawData;
};

/**
 * One frame of a read-only {@link StackModel.snapshot} — an action currently on the execution
 * stack. A frame that is a concurrent group ({@link Control.all}/{@link Control.any}) also lists
 * its branches, each a whole {@link StackSnapshot}.
 *
 * `branches` used to be `StackFrameSnapshot[][]` — only each branch's `frames`. That silently threw
 * away everything a nested stack knows about ITSELF: a `Control.repeat` runs as a nested StackModel,
 * so its `loop` counter lived on a snapshot whose frames were kept and whose `loop` and `tag` were
 * dropped on the way out. The counter was therefore unreachable from `getStackSnapshot()` no matter
 * how a caller asked, which is exactly what a debug view most wants to show.
 *
 * **Experimental / read-only.** For tooling (Studio's call-stack view). The exact shape is not a
 * stable contract and may change; do not serialize it or drive game logic from it.
 */
export type StackFrameSnapshot = {
    actionId: string | null;
    actionType: string | null;
    branchWaitType?: StackModelWaiting["type"];
    branches?: StackSnapshot[];
};

/**
 * Read-only view of a StackModel's execution stack. `frames` are ordered top-first (the frame
 * currently executing is `frames[0]`). See {@link StackFrameSnapshot} — experimental.
 */
export type StackSnapshot = {
    tag?: string;
    frames: StackFrameSnapshot[];
    loop?: { type: StackModelLoopType; counter: number; limit?: number; broken: boolean };
};

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

/**
 * The action type of a scene call's return address.
 *
 * Written out rather than imported from `actionTypes`: this module is reached from the action
 * layer, and importing the action-type table back into it closes a cycle that only shows up as an
 * undefined at class-evaluation time. `stackModel.callFrame.test.ts` pins the two together.
 */
const SCENE_RESUME_ACTION_TYPE = "scene:resume";

/** Threshold for infinite loop detection in debug mode */
const LOOP_DEBUG_THRESHOLD = 32767;
/** Minimum time in ms that LOOP_DEBUG_THRESHOLD iterations should take to not be considered suspicious */
const LOOP_DEBUG_MIN_TIME_MS = 1000;

export class StackModel {
    __tag: string | undefined = undefined;

    public static isStackModel(action: CalledActionResult | Awaitable<CalledActionResult> | StackModel): action is StackModel {
        return action instanceof StackModel;
    }

    public static createStackModel(liveGame: LiveGame, data: StackModelRawData, actionMap: Map<string, LogicAction.Actions>): StackModel {
        const stackModel = new StackModel(liveGame);
        stackModel.deserialize(data, actionMap);
        return stackModel;
    }

    /**
     * Create a count-based loop StackModel (repeat N times)
     */
    public static createCountLoop(
        liveGame: LiveGame,
        times: number,
        bodyActions: LogicAction.Actions[]
    ): StackModel {
        const stackModel = new StackModel(liveGame, "loop:count");
        stackModel.initLoop({
            type: "count",
            counter: 0,
            limit: times,
            bodyActionIds: bodyActions.map(a => a.getId()),
            broken: false,
        }, bodyActions, null);
        return stackModel;
    }

    /**
     * Create a condition-based loop StackModel (while condition is true)
     */
    public static createConditionLoop(
        liveGame: LiveGame,
        condition: Lambda<boolean>,
        conditionActionId: string,
        bodyActions: LogicAction.Actions[]
    ): StackModel {
        const stackModel = new StackModel(liveGame, "loop:condition");
        stackModel.initLoop({
            type: "condition",
            counter: 0,
            conditionActionId,
            bodyActionIds: bodyActions.map(a => a.getId()),
            broken: false,
        }, bodyActions, condition);
        return stackModel;
    }

    public static isCalledActionResult(action: CalledActionResult | Awaitable<CalledActionResult> | StackModel | undefined | null): action is CalledActionResult {
        return !!action
            && !this.isStackModel(action)
            && !Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(action)
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

    public static isStackModelsAwaiting(type: StackModelWaiting["type"], stackModels: StackModel[]): boolean {
        if (stackModels.length === 0) {
            throw new Error("StackModel: StackModels are empty.");
        }

        if (type === "any") {
            // if every stack is NOT empty, then the stack model is waiting
            return stackModels.every(stack => !stack.isEmpty());
        } else {
            // if any stack is NOT empty, then the stack model is waiting
            return stackModels.some(stack => !stack.isEmpty());
        }
    }

    private stack: Stack<CalledActionResult | Awaitable<CalledActionResult>>;
    private waitingAction: CalledActionResult | null = null;

    // Loop-related fields
    private loopConfig: StackModelLoopConfig | null = null;
    private loopBodyActions: LogicAction.Actions[] = [];
    private loopCondition: Lambda<boolean> | null = null;
    private loopStartTime: number = 0;
    private loopDebugCheckpoint: number = 0;

    constructor(private liveGame: LiveGame, tag: string | undefined = undefined) {
        this.__tag = tag;
        this.stack = new Stack<CalledActionResult | Awaitable<CalledActionResult>>().addPushValidator((item) => {
            const peek = this.stack.peek();

            // When pushing new item, the peek should not be the same as the item
            if (item === peek) {
                throw new RuntimeInternalError("StackModel: Unexpected self-push in stack.");
            }

            // When pushing new item, the peek should not be a waiting action (awaitable/stackModel)
            if (StackModel.isCalledActionResult(peek)) {
                if (peek.wait && StackModel.isStackModelsAwaiting(peek.wait.type, peek.wait.stackModels)) {
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
     * Initialize loop configuration
     */
    private initLoop(
        config: StackModelLoopConfig,
        bodyActions: LogicAction.Actions[],
        condition: Lambda<boolean> | null
    ): void {
        this.loopConfig = config;
        this.loopBodyActions = bodyActions;
        this.loopCondition = condition;
        this.loopStartTime = Date.now();
        this.loopDebugCheckpoint = 0;

        // Push the first iteration body actions to stack
        if (this.shouldContinueLoop(this.liveGame.getGameStateForce())) {
            this.pushLoopBody();
        }
    }

    /**
     * Check if the loop should continue
     */
    private shouldContinueLoop(gameState: GameState): boolean {
        if (!this.loopConfig || this.loopConfig.broken) {
            return false;
        }

        if (this.loopConfig.type === "count") {
            return this.loopConfig.counter < (this.loopConfig.limit ?? 0);
        } else {
            // condition loop
            if (!this.loopCondition) {
                return false;
            }
            return this.loopCondition.evaluate({ gameState }).value;
        }
    }

    /**
     * Push loop body actions to stack for next iteration
     */
    private pushLoopBody(): void {
        if (this.loopBodyActions.length === 0) {
            return;
        }

        // Push actions in reverse order so they execute in correct order
        for (let i = this.loopBodyActions.length - 1; i >= 0; i--) {
            this.stack.push(StackModel.fromAction(this.loopBodyActions[i]));
        }
    }

    /**
     * Called when an iteration completes, checks if loop should continue
     */
    private onIterationComplete(): void {
        if (!this.loopConfig || this.loopConfig.broken) {
            return;
        }

        this.loopConfig.counter++;

        // Debug mode: check for potential infinite loops
        if (this.liveGame.game.config.app.debug) {
            this.checkInfiniteLoop();
        }

        // Check if loop should continue
        if (this.shouldContinueLoop(this.liveGame.getGameStateForce())) {
            this.pushLoopBody();
        }
    }

    /**
     * Check for potential infinite loops in debug mode
     */
    private checkInfiniteLoop(): void {
        if (!this.loopConfig) return;

        const currentCount = this.loopConfig.counter;
        if (currentCount > 0 && currentCount % LOOP_DEBUG_THRESHOLD === 0) {
            const elapsed = Date.now() - this.loopStartTime;
            const iterationsSinceCheckpoint = currentCount - this.loopDebugCheckpoint;

            // If we've done LOOP_DEBUG_THRESHOLD iterations too quickly, it's likely an infinite loop
            if (iterationsSinceCheckpoint >= LOOP_DEBUG_THRESHOLD && elapsed < LOOP_DEBUG_MIN_TIME_MS) {
                const error = new RuntimeGameError(
                    "[NarraLeaf] Potential infinite loop detected!\n" +
                    `Loop has executed ${currentCount} iterations in ${elapsed}ms.\n` +
                    "This is likely a bug in your game script. Check your loop conditions.\n" +
                    `Loop type: ${this.loopConfig.type}, broken: ${this.loopConfig.broken}`
                );
                this.liveGame.getGameStateForce().logger.error("StackModel", error.message);
                throw error;
            }

            // Update checkpoint
            this.loopDebugCheckpoint = currentCount;
            this.loopStartTime = Date.now();
        }
    }

    /**
     * Break the current loop
     */
    public breakLoop(): void {
        if (!this.loopConfig) {
            throw new RuntimeGameError("Cannot break: StackModel is not a loop");
        }
        this.loopConfig.broken = true;
        // Clear the stack to exit the loop immediately
        this.stack.clear();
    }

    /**
     * Check if this StackModel is a loop
     */
    public isLoop(): boolean {
        return this.loopConfig !== null;
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
            if (StackModel.isStackModelsAwaiting(peek.wait.type, stackModels)) {
                stackModels.forEach(stack => stack.rollNext());
                return peek;
            }

            // The group is over, and under "any" that can be true with branches that never got
            // there - one branch draining is the whole condition. Those branches are given up
            // rather than simply left behind: a branch cut mid-call is holding the only frame that
            // could have returned to the scene it suspended.
            stackModels.forEach(stack => {
                if (!stack.isEmpty()) {
                    stack.abandon();
                }
            });
        }

        // Reset waiting action
        this.waitingAction = null;

        // Pop and execute current operation
        const currentAction = this.stack.pop()!;
        // Handle Awaitable type result
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(currentAction)) {
            if (currentAction.isFailed()) {
                throw currentAction.error;
            }

            const result = currentAction.result;
            if (result) {
                // Push the resolved action into the stack
                this.stack.push(result);
                this.liveGame.getGameStateForce().logger.debug("next action (resolved awaitable)", result.node?.action);
                return result;
            }
        } else {
            // Execute regular operation and handle result
            this.waitingAction = currentAction;
            const executed = this.executeActions(currentAction);

            return executed;
        }

        return null;
    }

    public execute(): Awaitable<void> {
        let currentWaiting: Awaitable | null = null,
            exited = false;
        const awaitable = new Awaitable<void>()
            .registerSkipController(new SkipController(() => {
                exited = true;
                currentWaiting?.abort();
            }));

        const roll = async () => {
            let count = 0;
            while (!exited) {
                if (count++ > this.liveGame.game.config.maxStackModelLoop) {
                    throw new Error("StackModel: Suspiciously long waiting loop.");
                }

                // Check if stack is empty
                if (this.stack.isEmpty()) {
                    // If this is a loop, check if we should continue
                    if (this.loopConfig && !this.loopConfig.broken) {
                        this.onIterationComplete();
                        // If loop pushed new actions, continue
                        if (!this.stack.isEmpty()) {
                            continue;
                        }
                    }
                    exited = true;
                    break;
                }

                const result: CalledActionResult | Awaitable<CalledActionResult> | null = this.rollNext();
                if (!result) {
                    continue;
                }
                if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
                    if (result.isFailed()) {
                        throw result.error;
                    }
                    if (result.isSettled()) {
                        continue;
                    } else {
                        currentWaiting = result;
                        // Wait for the action to settle rather than awaiting it directly:
                        // `Awaitable.abort()` deliberately does not run the `then` callbacks,
                        // so `await result` would park here forever once an in-flight action is
                        // aborted (undo landing mid-animation). This stack would then never
                        // settle, never be dropped from LiveGame's asyncStackModels, and would
                        // be serialized into the save and re-executed on load.
                        await new Promise<void>(resolve => {
                            result.onSettled(resolve);
                        });
                        if (result.isFailed()) {
                            throw result.error;
                        }
                        if (result.isAborted()) {
                            // The action was rewound or skipped, so whatever is queued behind it
                            // is no longer reachable.
                            exited = true;
                            break;
                        }
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

        roll()
            .then(() => awaitable.resolve())
            .catch(error => awaitable.fail(error));
        return awaitable;
    }

    public abortStackTop(): CalledActionResult | null {
        if (this.stack.isEmpty()) {
            return null;
        }
        const peek = this.stack.peek();
        if (peek && Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)) {
            (this.stack.pop() as Awaitable<CalledActionResult>).abort();
            this.waitingAction = null;
        } else if (StackModel.isCalledActionResult(peek) && peek.wait) {
            peek.wait.stackModels.forEach(stack => stack.abortStackTop());
            this.waitingAction = null;
        }

        return this.waitingAction;
    }

    /**
     * Return the unsettled Awaitable currently at the top of the stack, if any.
     *
     * Unlike {@link getTopSync} (which returns the top {@link CalledActionResult} and skips
     * awaitables), this exposes the awaitable the player is suspended on — used by
     * {@link LiveGame.fastForward} to await a step's settle before advancing to the next line.
     * @internal
     */
    public getWaitingAwaitable(): Awaitable<CalledActionResult> | null {
        if (this.stack.isEmpty()) {
            return null;
        }
        const peek = this.stack.peek();
        if (peek && Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek) && !peek.isSettled()) {
            return peek;
        }
        return null;
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

    /**
     * The id of the top-most action-bearing item on the stack, or `null` if the stack holds
     * no action (empty, or only awaitables with no underlying action).
     *
     * Unlike {@link getTopSync} this never throws: it walks past any awaitables/links on top
     * and returns the first {@link CalledActionResult}'s action id. A lightweight read-only
     * probe of the play head.
     * @internal
     */
    public peekTopActionId(): string | null {
        for (let i = this.stack.size() - 1; i >= 0; i--) {
            const item = this.stack.get(i);
            if (StackModel.isCalledActionResult(item)) {
                return item.node?.action?.getId() ?? null;
            }
        }
        return null;
    }

    /**
     * The id of the action sitting at the execution front — the very top item, but only when it
     * is a plain {@link CalledActionResult} (an action about to run). Returns `null` when the top
     * is a suspended {@link Awaitable} (a step still in progress) or the stack is empty.
     *
     * Unlike {@link peekTopActionId} this does **not** walk past awaitables: a continuation buried
     * beneath an in-flight step (e.g. the tail of a `Control.do([...])` whose first child is still
     * running) is not reported. {@link LiveGame.fastForward} uses this so an `actionId` target only
     * matches once the target is genuinely the next thing to execute, never while it is still
     * suspended under an in-progress step.
     * @internal
     */
    public peekExecutingActionId(): string | null {
        if (this.stack.isEmpty()) {
            return null;
        }
        const peek = this.stack.peek();
        if (peek && StackModel.isCalledActionResult(peek)) {
            return peek.node?.action?.getId() ?? null;
        }
        return null;
    }

    /**
     * Read-only, top-first view of the execution stack for tooling (Studio's call-stack view).
     * Awaitables are skipped; a concurrent group frame carries its branches recursively.
     *
     * **Experimental**: unlike {@link serialize} (a versioned save format), this is a convenience
     * projection whose shape is not a stability contract. It never mutates the stack.
     * @internal
     */
    public snapshot(): StackSnapshot {
        const frames: StackFrameSnapshot[] = [];
        for (let i = this.stack.size() - 1; i >= 0; i--) {
            const item = this.stack.get(i);
            if (!StackModel.isCalledActionResult(item)) {
                continue;
            }
            const frame: StackFrameSnapshot = {
                actionId: item.node?.action?.getId() ?? null,
                actionType: item.node?.action?.type ?? null,
            };
            if (item.wait?.stackModels) {
                frame.branchWaitType = item.wait.type;
                // The whole snapshot, not just `.frames`: a branch that is a loop carries its
                // counter on the snapshot object, and taking only the frames dropped it.
                frame.branches = item.wait.stackModels.map(stack => stack.snapshot());
            }
            frames.push(frame);
        }

        const result: StackSnapshot = { frames };
        if (this.__tag) {
            result.tag = this.__tag;
        }
        if (this.loopConfig) {
            result.loop = {
                type: this.loopConfig.type,
                counter: this.loopConfig.counter,
                limit: this.loopConfig.limit,
                broken: this.loopConfig.broken,
            };
        }
        return result;
    }

    executeActions(result: CalledActionResult): CalledActionResult | Awaitable<CalledActionResult> | null {
        if (!result.node?.action) return null;
        const executed = this.liveGame.executeAction(this.liveGame.getGameStateForce(), result.node.action, {
            stackModel: this,
        });

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
            return StackModel.isStackModelsAwaiting(peek.wait.type, peek.wait.stackModels);
        }

        return false;
    }

    /**
     * Serialize current StackModel into a plain JSON-serialisable structure.
     *
     * @param frozen - When true (default), the snapshot also contains the
     *                 action currently executing at the top of the stack
     *                 (waitingAction). This is required by save/load so that
     *                 reloading a save resumes exactly at the current dialog or
     *                 async node, keeping the runtime state self-consistent.
     *                 When false, waitingAction is excluded and the snapshot
     *                 reflects the state *before* the current action started.
     *                 The undo/history system will then re-insert the action
     *                 manually (see LiveGame.undo) to avoid having two copies
     *                 of the same action after deserialisation.
     * @returns Snapshot that can be passed to StackModel.deserialize.
     */
    serialize(frozen: boolean = true): StackModelRawData {
        const toData = (item: CalledActionResult | Awaitable<CalledActionResult>): StackModelItemData | null => {
            if (StackModel.isCalledActionResult(item)) {
                const actionId = item.node?.action?.getId() ?? null;
                const actionType = item.node?.action?.type ?? null;

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
        const items = this.stack.map(toData).filter(function (item): item is Exclude<StackModelItemData | null, null> {
            return item !== null;
        });
        if (frozen && this.waitingAction) {
            const actionData = toData(this.waitingAction);
            if (actionData) {
                items.push(actionData);
            }
        }

        const result: StackModelRawData = { items };

        // Serialize loop configuration if present
        if (this.loopConfig) {
            result.loop = {
                type: this.loopConfig.type,
                counter: this.loopConfig.counter,
                limit: this.loopConfig.limit,
                conditionActionId: this.loopConfig.conditionActionId,
                bodyActionIds: this.loopConfig.bodyActionIds,
                broken: this.loopConfig.broken,
            };
        }

        return result;
    }

    /**
     * Give up everything this stack still holds, unwinding the scene calls it opened on the way.
     *
     * {@link reset} clears stacks; it does not put the stage back. A branch cut mid-call is holding
     * a `scene:resume` - the promise to come back to the scene it suspended - and dropping that
     * promise without keeping it leaves the caller parked on the stage with nothing able to return
     * to it, and the called scene mounted with nothing pointing at it. Both are permanent: no later
     * action names either scene. So the call is given up, innermost first, which is what
     * `SceneAction.unwindCallStack` does when a plain jump walks away from a call stack.
     *
     * Only the call frames are unwound. A scene the branch merely *entered* - what a plain jump
     * does - belongs to the main stack from the moment the jump re-pointed it at that scene, so it
     * is the story's scene by then rather than the branch's, and taking it off the stage here would
     * unload the scene the story is now in.
     */
    public abandon(): this {
        const frames: LogicAction.Actions[] = [];
        this.collectCallFrames(frames);
        if (frames.length) {
            const gameState = this.liveGame.getGameStateForce();
            frames.forEach(action => action.abandon(gameState));
        }
        this.reset();
        return this;
    }

    /**
     * Every scene-call return address this stack is holding, innermost first.
     *
     * Nested groups are searched too: a branch can itself be running a `Control.all` whose own
     * branch opened a call, and that call is held just as firmly.
     */
    private collectCallFrames(out: LogicAction.Actions[]): void {
        const collectFrom = (item: CalledActionResult | Awaitable<CalledActionResult> | undefined) => {
            if (!StackModel.isCalledActionResult(item)) {
                return;
            }
            item.wait?.stackModels.forEach(stack => stack.collectCallFrames(out));
            const action = item.node?.action;
            if (action && action.type === SCENE_RESUME_ACTION_TYPE) {
                out.push(action);
            }
        };

        collectFrom(this.waitingAction ?? undefined);
        for (let i = this.stack.size() - 1; i >= 0; i--) {
            collectFrom(this.stack.get(i));
        }
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
        // Reset loop state
        this.loopConfig = null;
        this.loopBodyActions = [];
        this.loopCondition = null;
        this.loopStartTime = 0;
        this.loopDebugCheckpoint = 0;
    }

    deserialize(data: StackModelRawData, actionMap: Map<string, LogicAction.Actions>): this {
        this.reset();

        const items = data.items;

        for (const item of items) {
            if (item.type === StackModelItemType.Action) {
                if (!item.action) continue;

                const { actionType, action } = item;
                const found = actionMap.get(action);
                if (!found) {
                    throw new Error(`Action not found: ${action}`);
                }

                this.stack.push({ type: actionType, node: found.contentNode, wait: null });
            } else if (item.type === StackModelItemType.Link) {
                const { actionType, action, stacks, stackWaitType } = item;
                if (stackWaitType == null) {
                    throw new Error(`Missing stackWaitType for link action: ${action}`);
                }

                this.stack.push({
                    type: actionType,
                    node: action ? actionMap.get(action)?.contentNode ?? null : null,
                    wait: {
                        type: stackWaitType, stackModels: stacks.map(stack => StackModel.createStackModel(this.liveGame, stack, actionMap))
                    }
                });
            }
        }

        // Deserialize loop configuration if present
        if (data.loop) {
            const loopData = data.loop;
            const bodyActions: LogicAction.Actions[] = [];

            // Restore body actions from IDs
            for (const actionId of loopData.bodyActionIds) {
                const action = actionMap.get(actionId);
                if (!action) {
                    throw new Error(`Loop body action not found: ${actionId}`);
                }
                bodyActions.push(action);
            }

            // Restore condition for condition loops
            let condition: Lambda<boolean> | null = null;
            if (loopData.type === "condition" && loopData.conditionActionId) {
                const conditionAction = actionMap.get(loopData.conditionActionId);
                if (conditionAction) {
                    // The condition Lambda is stored in the action's ContentNode
                    const content = conditionAction.contentNode.getContent();
                    if (Array.isArray(content) && content.length >= 2 && Lambda.isLambda(content[1])) {
                        condition = content[1];
                    }
                }
            }

            this.loopConfig = {
                type: loopData.type,
                counter: loopData.counter,
                limit: loopData.limit,
                conditionActionId: loopData.conditionActionId,
                bodyActionIds: loopData.bodyActionIds,
                broken: loopData.broken,
            };
            this.loopBodyActions = bodyActions;
            this.loopCondition = condition;
            this.loopStartTime = Date.now();
            this.loopDebugCheckpoint = loopData.counter;
        }

        return this;
    }

    isEmpty(): boolean {
        return this.stack.isEmpty();
    }

    /**
     * Drop everything above the innermost scene-call return address, or the whole stack if there
     * is none.
     *
     * This is what moving the play head has to do instead of clearing outright once a scene can be
     * called. A `scene:resume` item on the stack is a promise to come back to the scene that made
     * the call, and it sits below everything the called scene has queued - so clearing to it moves
     * the head within the called scene and leaves the promise intact, while clearing past it would
     * strand a suspended scene on the stage with nothing able to return to it.
     *
     * With no call open the stack has no such item and this is exactly {@link reset}, which is what
     * an in-scene jump has always done.
     */
    public clearAboveCallFrame(): this {
        for (let i = this.stack.size() - 1; i >= 0; i--) {
            const item = this.stack.get(i);
            if (StackModel.isCalledActionResult(item) && item.node?.action?.type === SCENE_RESUME_ACTION_TYPE) {
                while (this.stack.size() > i + 1) {
                    const dropped = this.stack.pop();
                    if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(dropped)) {
                        dropped.abort();
                    } else if (StackModel.isCalledActionResult(dropped)) {
                        dropped.wait?.stackModels.forEach(stack => stack.reset());
                    }
                }
                this.waitingAction = null;
                return this;
            }
        }
        this.reset();
        return this;
    }

    push(...items: (CalledActionResult | Awaitable<CalledActionResult>)[]): this {
        this.stack.push(...items);
        return this;
    }
}

