import {Actionable} from "@core/action/actionable";
import {LogicAction} from "@core/action/logicAction";
import {ControlAction} from "@core/action/actions";
import {ContentNode} from "@core/action/tree/actionTree";
import {Game} from "@core/game";
import {Values} from "@lib/util/data";
import {Chained, ChainedActions, Proxied} from "@core/action/chain";
import Actions = LogicAction.Actions;

type ChainedControl = Proxied<Control, Chained<LogicAction.Actions>>;

export class Control extends Actionable {
    /**
     * Execute actions in order, waiting for each action to complete
     */
    public static do(actions: ChainedActions) {
        return new Control().do(actions);
    }

    /**
     * Execute actions in order, do not wait for this action to complete
     */
    public static doAsync(actions: ChainedActions) {
        return new Control().doAsync(actions);
    }

    /**
     * Execute all actions at the same time, waiting for any one action to complete
     */
    public static any(actions: ChainedActions) {
        return new Control().any(actions);
    }

    /**
     * Execute all actions at the same time, waiting for all actions to complete
     */
    public static all(actions: ChainedActions) {
        return new Control().all(actions);
    }

    /**
     * Execute all actions at the same time, do not wait for all actions to complete
     */
    public static allAsync(actions: ChainedActions) {
        return new Control().allAsync(actions);
    }

    /**
     * Execute actions multiple times
     */
    public static repeat(times: number, actions: ChainedActions) {
        return new Control().repeat(times, actions);
    }

    constructor() {
        super(Actionable.IdPrefixes.Control);
    }


    public do(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.do, actions);
    }

    public doAsync(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.doAsync, actions);
    }

    public any(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.any, actions);
    }

    public all(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.all, actions);
    }

    public allAsync(actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.allAsync, actions);
    }

    public repeat(times: number, actions: ChainedActions): ChainedControl {
        return this.push(ControlAction.ActionTypes.repeat, actions, times);
    }

    construct(actions: Actions[]): Actions[] {
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            if (i !== 0) {
                actions[i - 1]?.contentNode.setInitChild(action.contentNode);
            }
        }
        return actions;
    }

    private push(
        type: Values<typeof ControlAction.ActionTypes>,
        actions: ChainedActions,
        ...args: any[]
    ): ChainedControl {
        const flatted = Chained.toActions(actions);
        const action = new ControlAction(
            this,
            type,
            new ContentNode(Game.getIdManager().getStringId()).setContent([this.construct(flatted), ...args])
        );
        return this.chain(action);
    }
}

