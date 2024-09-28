import {RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Chainable, Chained, Proxied} from "@core/action/chain";
import {TypedAction} from "@core/action/actions";
import GameElement = LogicAction.GameElement;

export class Constructable<
    TAction extends LogicAction.Actions = LogicAction.Actions,
    Self extends Constructable<TAction> = any
> extends Chainable<LogicAction.Actions, Self> {

    constructor() {
        super();
    }

    /**@internal */
    public fromChained(chained: Proxied<GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chained.getActions();
    }

    /**@internal */
    forEachChild(actionOrActions: LogicAction.Actions | LogicAction.Actions[], cb: ((action: TypedAction) => void)): void {
        const seen = new Set<LogicAction.Actions>();
        const queue: LogicAction.Actions[] = [];

        if (Array.isArray(actionOrActions)) {
            queue.push(...actionOrActions);
        } else {
            queue.push(actionOrActions);
        }

        while (queue.length) {
            const action = queue.shift()!;
            if (seen.has(action)) {
                continue;
            }
            seen.add(action);

            cb(action);

            const children = action.getFutureActions()
                .filter(action => !seen.has(action));
            queue.push(...children);
        }
    }

    /**@internal */
    getAllChildren(action: LogicAction.Actions | LogicAction.Actions[]): LogicAction.Actions[] {
        const children: LogicAction.Actions[] = [];
        this.forEachChild(action, action => children.push(action));
        return children;
    }

    /**@internal */
    getAllChildrenMap(action: LogicAction.Actions | LogicAction.Actions[]): Map<string, LogicAction.Actions> {
        const map = new Map<string, LogicAction.Actions>();
        this.forEachChild(action, action => map.set(action.getId(), action));
        return map;
    }

    /**@internal */
    getAllElementMap(action: LogicAction.Actions | LogicAction.Actions[]): Map<string, LogicAction.GameElement> {
        const map = new Map<string, LogicAction.GameElement>();
        this.forEachChild(action, action => map.set(action.getId(), action.callee));
        return map;
    }

    /**@internal */
    getAllChildrenElements(action: LogicAction.Actions | LogicAction.Actions[]): LogicAction.GameElement[] {
        return Array.from(new Set(this.getAllChildren(action).map(action => action.callee)));
    }

    /**@internal */
    toData(): Record<string, any> | null {
        return null;
    }

    /**@internal */
    fromData(_: Record<string, any>) {
        return this;
    }

    /**
     * Construct the actions into a tree
     * @internal
     */
    protected construct(actions: LogicAction.Actions[], parent?: RenderableNode): RenderableNode | null {
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            if (i === 0 && parent) {
                parent.setInitChild(action.contentNode);
            } else if (i > 0) {
                (actions[i - 1].contentNode)?.setInitChild(action.contentNode);
            }
        }
        return (actions.length) ? actions[0].contentNode : null;
    }
}

