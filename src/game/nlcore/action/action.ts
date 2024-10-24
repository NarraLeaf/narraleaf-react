import {LogicAction} from "./logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, getCallStack} from "@lib/util/data";
import {GameState} from "@player/gameState";

export class Action<ContentNodeType = any, Callee = LogicAction.GameElement, Type extends string = any> {
    static ActionTypes = {
        action: "action",
    };
    callee: Callee;
    type: Type;
    contentNode: ContentNode<ContentNodeType>;
    _id: string;

    readonly __stack: string;

    constructor(callee: Callee, type: Type, contentNode: ContentNode<ContentNodeType>) {
        this.callee = callee;
        this.type = type;
        this.contentNode = contentNode;
        this.__stack = getCallStack();
        this._id = "";
    }

    public executeAction(_state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        return {
            type: this.type as any,
            node: this.contentNode.getChild(),
        };
    }

    getId() {
        return this._id;
    }

    setId(id: string) {
        this._id = id;
    }

    getFutureActions(): LogicAction.Actions[] {
        const action = this.contentNode.getChild();
        return (action && action.action) ? [action.action] : [];
    }
}