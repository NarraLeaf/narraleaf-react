import {RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";

import {Action} from "@core/action/action";
import {SceneActionTypes} from "@core/action/actionTypes";
import {Chainable, Chained, Proxied} from "@core/action/chain";
import {TypedAction} from "@core/action/actions";
import GameElement = LogicAction.GameElement;

export class Constructable<
    TAction extends LogicAction.Actions = LogicAction.Actions,
    Self extends Constructable<TAction> = any
> extends Chainable<LogicAction.Actions, Self> {
    /**
     * @deprecated
     */
    static targetAction: any = Action;
    /**
     * @deprecated
     * @private
     */
    private readonly actions: TAction[];

    constructor() {
        super();
        this.actions = [];
    }

    /**
     * @deprecated
     */
    _getActions() {
        return this.actions;
    }

    /**
     * @internal
     * @deprecated
     */
    getAllActions_(includeJumpTo?: boolean, actions?: LogicAction.Actions[]): LogicAction.Actions[] {
        const set = new Set<LogicAction.Actions>();
        this.forEachAction_(action => set.add(action), includeJumpTo, actions);

        return Array.from(set);
    }

    /**
     * @internal
     * @deprecated
     */
    forEachAction_(callback: (action: LogicAction.Actions) => void, includeJumpTo = true, actions?: LogicAction.Actions[]): void {
        const seen: string[] = [];
        (actions || this._getActions()).forEach(sceneAction => {
            const queue: LogicAction.Actions[] = [];
            queue.push(sceneAction);

            while (queue.length > 0) {
                const action = queue.shift()!;
                if (action.type === SceneActionTypes.jumpTo) {
                    if (!includeJumpTo || seen.includes(action.getId())) {
                        continue;
                    }
                    seen.push(action.getId());
                }

                callback(action);
                const actions = action.getFutureActions();
                queue.push(...actions);
            }
        });
    }

    /**
     * @internal
     * @deprecated
     * Find multiple elements by multiple IDs
     */
    findElementsByIds_(ids: string[], elements: LogicAction.GameElement[]): LogicAction.GameElement[] {
        const map = new Map<string, LogicAction.GameElement>();
        elements.forEach(element => map.set(element.id, element));
        return ids.map(id => map.get(id)).filter(Boolean) as LogicAction.GameElement[];
    }

    public fromChained(chained: Proxied<GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chained.getActions();
    }

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

    getAllChildren(action: LogicAction.Actions | LogicAction.Actions[]): LogicAction.Actions[] {
        const children: LogicAction.Actions[] = [];
        this.forEachChild(action, action => children.push(action));
        return children;
    }

    getAllChildrenElements(action: LogicAction.Actions | LogicAction.Actions[]): LogicAction.GameElement[] {
        return Array.from(new Set(this.getAllChildren(action).map(action => action.callee)));
    }

    toData(): Record<string, any> | null {
        return null;
    }

    fromData(_: Record<string, any>) {
        return this;
    }

    /**
     * Construct the actions into a tree
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

