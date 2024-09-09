import {Actionable} from "@core/action/actionable";
import {LogicAction} from "@core/action/logicAction";
import {ControlAction} from "@core/action/actions";
import {ContentNode} from "@core/action/tree/actionTree";
import {Game} from "@core/game";
import {Values} from "@lib/util/data";
import Actions = LogicAction.Actions;


export class Control extends Actionable {
    /**
     * 按顺序执行操作，并且等待执行完成
     */
    public static do(actions: (Actions | Actions[])[]): Control {
        return new Control().do(actions);
    }

    /**
     * 按顺序执行操作，不等待执行完成
     */
    public static doAsync(actions: (Actions | Actions[])[]): Control {
        return new Control().doAsync(actions);
    }

    /**
     * 同时执行所有操作，等待任意一个操作执行完成
     */
    public static any(actions: (Actions | Actions[])[]): Control {
        return new Control().any(actions);
    }

    /**
     * 同时执行所有操作，等待所有操作执行完成
     */
    public static all(actions: (Actions | Actions[])[]): Control {
        return new Control().all(actions);
    }

    /**
     * 同时执行所有操作，不等待所有操作执行完成
     */
    public static allAsync(actions: (Actions | Actions[])[]): Control {
        return new Control().allAsync(actions);
    }

    /**
     * 重复执行操作
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
            new ContentNode(
                Game.getIdManager().getStringId()
            ).setContent([this.construct(flatted), ...args])
        );
        this.actions.push(action);
        return this;
    }
}

