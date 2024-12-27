import {Actionable} from "@core/action/actionable";
import {LogicAction} from "@core/action/logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {Awaitable, Values} from "@lib/util/data";
import {Chained, ChainedActions, Proxied} from "@core/action/chain";
import {ControlAction} from "@core/action/actions/controlAction";


/**@internal */
type ChainedControl = Proxied<Control, Chained<LogicAction.Actions>>;

export class Control extends Actionable {
    /**
     * Execute actions in order, waiting for each action to complete
     * @chainable
     */
    public static do(actions: ChainedActions): ChainedControl {
        return new Control().do(actions);
    }

    /**
     * Execute actions in order, do not wait for this action to complete
     * @chainable
     */
    public static doAsync(actions: ChainedActions): ChainedControl {
        return new Control().doAsync(actions);
    }

    /**
     * Execute all actions at the same time, waiting for any one action to complete
     * @chainable
     */
    public static any(actions: ChainedActions): ChainedControl {
        return new Control().any(actions);
    }

    /**
     * Execute all actions at the same time, waiting for all actions to complete
     * @chainable
     */
    public static all(actions: ChainedActions): ChainedControl {
        return new Control().all(actions);
    }

    /**
     * Execute all actions at the same time, do not wait for all actions to complete
     * @chainable
     */
    public static allAsync(actions: ChainedActions): ChainedControl {
        return new Control().allAsync(actions);
    }

    /**
     * Execute actions multiple times
     * @chainable
     */
    public static repeat(times: number, actions: ChainedActions): ChainedControl {
        return new Control().repeat(times, actions);
    }

    /**
     * Sleep for a duration
     * @chainable
     */
    public static sleep(duration: number | Awaitable<any> | Promise<any>): ChainedControl {
        return new Control().sleep(duration);
    }

    constructor() {
        super();
    }

    /**
     * Execute actions in order, waiting for each action to complete
     * @chainable
     */
    public do(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.do, actions);
    }

    /**
     * Execute actions in order, do not wait for this action to complete
     * @chainable
     */
    public doAsync(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.doAsync, actions);
    }

    /**
     * Execute all actions at the same time, waiting for any one action to complete
     * @chainable
     */
    public any(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.any, actions);
    }

    /**
     * Execute all actions at the same time, waiting for all actions to complete
     * @chainable
     */
    public all(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.all, actions);
    }

    /**
     * Execute all actions at the same time, do not wait for all actions to complete
     * @chainable
     */
    public allAsync(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.allAsync, actions);
    }

    /**
     * Execute actions multiple times
     * @chainable
     */
    public repeat(times: number, actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.repeat, actions, times);
    }

    /**
     * Sleep for a duration
     * @chainable
     */
    public sleep(duration: number | Awaitable<any> | Promise<any>): ChainedControl {
        return this.push(ControlAction.ActionTypes.sleep, [], duration);
    }

    /**@internal */
    private push(
        type: Values<typeof ControlAction.ActionTypes>,
        actions: ChainedActions,
        ...args: any[]
    ): ChainedControl {
        const flatted = Chained.toActions(actions);
        const action = new ControlAction(
            this.chain(),
            type,
            new ContentNode().setContent([this.construct(flatted), ...args])
        );
        return this.chain(action);
    }
}

