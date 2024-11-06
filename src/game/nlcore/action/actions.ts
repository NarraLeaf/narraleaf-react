import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Action} from "@core/action/action";
import {Chained, Proxied} from "@core/action/chain";
import {Awaitable} from "@lib/util/data";
import {CalledActionResult} from "@core/gameTypes";

export class TypedAction<
    ContentType extends Record<string, any> = Record<string, any>,
    T extends keyof ContentType & string = keyof ContentType & string,
    Callee extends LogicAction.GameElement = LogicAction.GameElement
> extends Action<ContentType[T], Callee, T> {
    declare callee: Callee;

    constructor(callee: Proxied<Callee, Chained<LogicAction.Actions, Callee>>, type: T, contentNode: ContentNode<ContentType[T]>) {
        super(callee, type, contentNode);
        this.callee = callee.getSelf();
        this.contentNode.action = this;
    }

    unknownType() {
        throw new Error("Unknown action type: " + this.type);
    }

    resolveAwaitable<T extends CalledActionResult = any>(
        handler: (resolve: ((value: T) => void), awaitable: Awaitable<CalledActionResult, T>) => Promise<void> | void,
        awaitable?: Awaitable<CalledActionResult, T>
    ): Awaitable<CalledActionResult, T> {
        const a = awaitable || new Awaitable<CalledActionResult, T>(v => v as T);
        (async () => {
            await handler(a.resolve.bind(a), a);
        })();
        return a;
    }
}
