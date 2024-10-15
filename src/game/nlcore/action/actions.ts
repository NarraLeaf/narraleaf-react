import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Action} from "@core/action/action";
import {Chained, Proxied} from "@core/action/chain";

export class TypedAction<
    ContentType extends Record<string, any> = Record<string, any>,
    T extends keyof ContentType & string = keyof ContentType & string,
    Callee extends LogicAction.GameElement = LogicAction.GameElement
> extends Action<ContentType[T], Callee> {
    declare callee: Callee;

    constructor(callee: Proxied<Callee, Chained<LogicAction.Actions, Callee>>, type: any, contentNode: ContentNode<ContentType[T]>) {
        super(callee, type, contentNode);
        this.callee = callee.getSelf();
        this.contentNode.action = this;
    }

    unknownType() {
        throw new Error("Unknown action type: " + this.type);
    }
}
