import {Actionable} from "@core/action/actionable";
import {LogicAction} from "@core/action/logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {Awaitable, Values} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {ControlAction} from "@core/action/actions/controlAction";
import { ActionStatements, LambdaHandler } from "./type";
import { Narrator } from "./character";
import { Lambda } from "./condition";


/**@internal */
type ChainedControl = Proxied<Control, Chained<LogicAction.Actions>>;
/**@internal */
type ControlConfig = {
    allowFutureScene: boolean;
};


export class Control extends Actionable {
    /**
     * Execute actions in order, waiting for each action to complete.
     * @param actions - The sequence of actions to run.
     * @chainable
     * @example
     * ```ts
     * Control.do([character.say("hello"), image.char("path.png")]);
     * ```
     */
    public static do(actions: ActionStatements): ChainedControl {
        return new Control().do(actions);
    }

    /**
     * Execute actions in order without waiting for completion.
     * @param actions - Actions to run sequentially.
     * @chainable
     * @example
     * ```ts
     * Control.doAsync([sound.play(), image.char("path.png")]);
     * ```
     */
    public static doAsync(actions: ActionStatements): ChainedControl {
        return new Control().doAsync(actions);
    }

    /**
     * Execute actions concurrently, resolving once any finishes.
     *
     * Each entry runs as its own parallel branch, so a single chained statement (e.g.
     * `image.pos(a).pos(b)`) is split into multiple branches and they will conflict when
     * they target the same element. Wrap sequential steps in `Control.do([...])` to keep
     * them in one branch.
     * @param actions - Actions to run in parallel.
     * @chainable
     * @example
     * ```ts
     * Control.any([sound.play(), image.char("happy.png")]);
     * ```
     */
    public static any(actions: ActionStatements): ChainedControl {
        return new Control().any(actions);
    }

    /**
     * Execute actions concurrently and wait until all finish.
     *
     * Each entry runs as its own parallel branch, so a single chained statement (e.g.
     * `image.pos(a).pos(b)`) is split into multiple branches and they will conflict when
     * they target the same element. Wrap sequential steps in `Control.do([...])` to keep
     * them in one branch.
     * @param actions - Actions to run at the same time.
     * @chainable
     * @example
     * ```ts
     * Control.all([sound.play(), dialog.show()]);
     * ```
     */
    public static all(actions: ActionStatements): ChainedControl {
        return new Control().all(actions);
    }

    /**
     * Execute actions concurrently and continue without waiting.
     *
     * Each entry runs as its own parallel branch, so a single chained statement (e.g.
     * `image.pos(a).pos(b)`) is split into multiple branches and they will conflict when
     * they target the same element. Wrap sequential steps in `Control.do([...])` to keep
     * them in one branch.
     * @param actions - Actions to fire simultaneously.
     * @chainable
     */
    public static allAsync(actions: ActionStatements): ChainedControl {
        return new Control().allAsync(actions);
    }

    /**
     * Execute actions multiple times.
     * @param times - How many times to repeat.
     * @param actions - The actions to repeat.
     * @chainable
     * @example
     * ```ts
     * Control.repeat(3, [character.say("Again!")]);
     * ```
     */
    public static repeat(times: number, actions: ActionStatements): ChainedControl {
        return new Control().repeat(times, actions);
    }

    /**
     * Repeat actions while a condition stays true.
     * @param condition - Lambda to guard the loop.
     * @param actions - Body actions to run each iteration.
     * @chainable
     */
    public static whileLoop(condition: Lambda<boolean> | LambdaHandler<boolean>, actions: ActionStatements): ChainedControl {
        return new Control().whileLoop(condition, actions);
    }

    /**
     * Break out of the nearest repeating loop (repeat or while).
     * Can only be used inside a loop body.
     * @chainable
     */
    public static breakLoop(): ChainedControl {
        return new Control().breakLoop();
    }

    /**
     * Pause execution for a duration or until an `Awaitable` resolves.
     * @param duration - Milliseconds or awaitable controlling the pause length.
     * @chainable
     */
    public static sleep(duration: number | Awaitable<any> | Promise<any>): ChainedControl {
        return new Control().sleep(duration);
    }

    /**
     * Pause execution until the user clicks anywhere on the stage (excluding GUI/Page elements).
     * Similar to inserting a pause with no duration in a Sentence.
     * @chainable
     * @example
     * ```ts
     * Control.waitForClick();
     * ```
     */
    public static waitForClick(): ChainedControl {
        return new Control().waitForClick();
    }

    constructor(/**@internal */public config: Partial<ControlConfig> = {}) {
        super();
    }

    /**
     * Execute actions in order, waiting for each action to complete
     * @chainable
     */
    public do(actions: ActionStatements): ChainedControl {
        return this.push(ControlAction.ActionTypes.do, actions);
    }

    /**
     * Execute actions in order, do not wait for this action to complete
     * @chainable
     */
    public doAsync(actions: ActionStatements): ChainedControl {
        return this.push(ControlAction.ActionTypes.doAsync, actions);
    }

    /**
     * Execute all actions at the same time, waiting for any one action to complete
     * @chainable
     */
    public any(actions: ActionStatements): ChainedControl {
        return this.pushUnchained(ControlAction.ActionTypes.any, actions);
    }

    /**
     * Execute all actions at the same time, waiting for all actions to complete
     * @chainable
     */
    public all(actions: ActionStatements): ChainedControl {
        return this.pushUnchained(ControlAction.ActionTypes.all, actions);
    }

    /**
     * Execute all actions at the same time, do not wait for all actions to complete
     * @chainable
     */
    public allAsync(actions: ActionStatements): ChainedControl {
        return this.pushUnchained(ControlAction.ActionTypes.allAsync, actions);
    }

    /**
     * Execute actions multiple times
     * @chainable
     */
    public repeat(times: number, actions: ActionStatements): ChainedControl {
        // repeat/while feed their body to a StackModel loop, which pushes each body action onto
        // the stack independently and asserts (checkActionChain) the body is NOT chained. So keep
        // the body unchained here — unlike do/doAsync, which walk the body via child links.
        return this.pushUnchained(ControlAction.ActionTypes.repeat, actions, times);
    }

    /**
     * Execute actions while condition is true
     * @chainable
     */
    public whileLoop(condition: Lambda<boolean> | LambdaHandler<boolean>, actions: ActionStatements): ChainedControl {
        const lambda = Lambda.from(condition);
        return this.pushWithLambda(ControlAction.ActionTypes.while, actions, lambda);
    }

    /**
     * Break the current loop (repeat/while)
     * Can only be used inside a loop body
     * @chainable
     */
    public breakLoop(): ChainedControl {
        const action = new ControlAction(
            this.chain(),
            ControlAction.ActionTypes.break,
            new ContentNode().setContent([])
        );
        return this.chain(action);
    }

    /**
     * Sleep for a duration
     * @chainable
     */
    public sleep(duration: number | Awaitable<any> | Promise<any>): ChainedControl {
        return this.push(ControlAction.ActionTypes.sleep, [], duration);
    }

    /**
     * Wait for user to click the stage (excluding GUI elements)
     * @chainable
     */
    public waitForClick(): ChainedControl {
        const action = new ControlAction(
            this.chain(),
            ControlAction.ActionTypes.waitForClick,
            new ContentNode().setContent([])
        );
        return this.chain(action);
    }

    /**@internal */
    private push(
        type: Values<typeof ControlAction.ActionTypes>,
        actions: ActionStatements,
        ...args: any[]
    ): ChainedControl {
        const flatted = this.narrativeToActions(actions);
        const action = new ControlAction(
            this.chain(),
            type,
            new ContentNode().setContent([this.construct(flatted), ...args])
        );
        return this.chain(action);
    }

    /**@internal */
    private pushUnchained(
        type: Values<typeof ControlAction.ActionTypes>,
        actions: ActionStatements,
        ...args: any[]
    ): ChainedControl {
        const flatted = this.narrativeToActions(actions);
        const action = new ControlAction(
            this.chain(),
            type,
            new ContentNode().setContent([flatted, ...args])
        );
        return this.chain(action);
    }

    /**@internal */
    private pushWithLambda(
        type: Values<typeof ControlAction.ActionTypes>,
        actions: ActionStatements,
        lambda: Lambda<boolean>
    ): ChainedControl {
        // Body is left unchained: the while-loop StackModel pushes each body action independently
        // and asserts the body is not chained (see repeat/checkActionChain).
        const flatted = this.narrativeToActions(actions);
        const action = new ControlAction(
            this.chain(),
            type,
            new ContentNode().setContent([flatted, lambda])
        );
        return this.chain(action);
    }

    /**@internal */
    narrativeToActions(statements: ActionStatements): LogicAction.Actions[] {
        return statements.flatMap(statement => {
            if (typeof statement === "string") {
                return Narrator.say(statement).getActions();
            }
            return Chained.toActions([statement]);
        });
    }
}

