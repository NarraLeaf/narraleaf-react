import {Actionable} from "@core/action/actionable";
import {LogicAction} from "@core/action/logicAction";
import {ControlAction} from "@core/action/actions";
import {ContentNode} from "@core/action/tree/actionTree";
import {Game} from "@core/game";
import {Values} from "@lib/util/data";
import Actions = LogicAction.Actions;


export class Control extends Actionable {
    /**
     * Execute actions in order, waiting for each action to complete
     */
    public static do(actions: (Actions | Actions[])[]): Control {
        return new Control().do(actions);
    }

    /**
     * Execute actions in order, do not wait for this action to complete
     */
    public static doAsync(actions: (Actions | Actions[])[]): Control {
        return new Control().doAsync(actions);
    }

    /**
     * Execute all actions at the same time, waiting for any one action to complete
     */
    public static any(actions: (Actions | Actions[])[]): Control {
        return new Control().any(actions);
    }

    /**
     * Execute all actions at the same time, waiting for all actions to complete
     */
    public static all(actions: (Actions | Actions[])[]): Control {
        return new Control().all(actions);
    }

    /**
     * Execute all actions at the same time, do not wait for all actions to complete
     */
    public static allAsync(actions: (Actions | Actions[])[]): Control {
        return new Control().allAsync(actions);
    }

    /**
     * Execute actions multiple times
     */
    public static repeat(times: number, actions: (Actions | Actions[])[]): Control {
        return new Control().repeat(times, actions);
    }

    constructor() {
        super(Actionable.IdPrefixes.Control);
    }


    public do(actions: (Actions | Actions[])[]): this {
        return this.push(ControlAction.ActionTypes.do, actions);
    }

    public doAsync(actions: (Actions | Actions[])[]): this {
        return this.push(ControlAction.ActionTypes.doAsync, actions);
    }

    public any(actions: (Actions | Actions[])[]): this {
        return this.push(ControlAction.ActionTypes.any, actions);
    }

    public all(actions: (Actions | Actions[])[]): this {
        return this.push(ControlAction.ActionTypes.all, actions);
    }

    public allAsync(actions: (Actions | Actions[])[]): this {
        return this.push(ControlAction.ActionTypes.allAsync, actions);
    }

    public repeat(times: number, actions: (Actions | Actions[])[]): this {
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

    private push(type: Values<typeof ControlAction.ActionTypes>, actions: (Actions | Actions[])[], ...args: any[]): this {
        const flatted = actions.flat(2) as Actions[];
        const action = new ControlAction(
            this,
            type,
            new ContentNode(Game.getIdManager().getStringId()).setContent([this.construct(flatted), ...args])
        );
        this.actions.push(action);
        return this;
    }
}

