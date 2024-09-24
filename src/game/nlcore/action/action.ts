import {LogicAction} from "./logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, getCallStack} from "@lib/util/data";
import {GameState} from "@player/gameState";
import {Game} from "@core/game";

export class Action<ContentNodeType = any, Callee = LogicAction.GameElement> {
    static ActionTypes = {
        action: "action",
    };
    callee: Callee;
    type: ContentNodeType;
    contentNode: ContentNode<ContentNodeType>;
    _id: string;

    readonly __stack: string;

    constructor(callee: Callee, type: ContentNodeType, contentNode: ContentNode<ContentNodeType>) {
        this.callee = callee;
        this.type = type;
        this.contentNode = contentNode;
        this.__stack = getCallStack(4, 4);
        this._id = Game.getIdManager().prefix("action", Game.getIdManager().getStringId(), "-");
    }

    public executeAction(_state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        return {
            type: this.type as any,
            node: this.contentNode,
        };
    }

    getId() {
        return this._id;
    }

    getFutureActions(): LogicAction.Actions[] {
        const action = this.contentNode.child;
        return (action && action.action) ? [action.action] : [];
    }
}