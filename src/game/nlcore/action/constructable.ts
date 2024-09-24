import {ContentNode, RenderableNode, RootNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";

import {Action} from "@core/action/action";
import {SceneActionTypes} from "@core/action/actionTypes";
import {Chainable, Chained, Proxied} from "@core/action/chain";
import GameElement = LogicAction.GameElement;

export class Constructable<
    TAction extends LogicAction.Actions = LogicAction.Actions,
> extends Chainable<any, any> {
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
     * @param root
     */
    setRoot(root: RootNode): LogicAction.Actions | undefined {
        this.actions[0]?.contentNode.setParent(root);
        root.setChild(this.actions[0]?.contentNode);
        return this.actions[0];
    }

    /**
     * @deprecated
     */
    getActions() {
        return this.actions;
    }

    /**@internal */
    getAllActions(includeJumpTo?: boolean, actions?: LogicAction.Actions[]): LogicAction.Actions[] {
        const set = new Set<LogicAction.Actions>();
        this.forEachAction(action => set.add(action), includeJumpTo, actions);

        return Array.from(set);
    }

    /**@internal */
    forEachAction(callback: (action: LogicAction.Actions) => void, includeJumpTo = true, actions?: LogicAction.Actions[]): void {
        const seen: string[] = [];
        (actions || this.getActions()).forEach(sceneAction => {
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

    /**@internal */
    findActionById(id: string, actions?: LogicAction.Actions[]): LogicAction.Actions | null {
        if (actions) {
            const action = actions.find(action => action.getId() === id);
            return action || null;
        }

        const futureActions = this.getActions();
        const queue: LogicAction.Actions[] = [];
        const seen: string[] = [];
        queue.push(...futureActions);

        while (queue.length > 0) {
            const action = queue.shift()!;
            if (action.getId() === id) {
                return action;
            }

            if (action.type === SceneActionTypes.jumpTo) {
                if (seen.includes(action.getId())) {
                    continue;
                }
                seen.push(action.getId());
            }

            queue.push(...action.getFutureActions());
        }

        return null;
    }

    /**@internal */
    getAllElements(actions?: LogicAction.Actions[]): LogicAction.GameElement[] {
        const action = actions || this.getAllActions();
        const set = new Set<LogicAction.GameElement>(
            action.map(action => action.callee)
        );
        return Array.from(set);
    }

    /**@internal */
    getActionsByType(type: LogicAction.ActionTypes, actions?: LogicAction.Actions[]): LogicAction.Actions[] {
        const action = actions || this.getAllActions();
        return action.filter(action => action.type === type);
    }

    /**@internal */
    getAllNodes(actions?: LogicAction.Actions[]): ContentNode[] {
        const action = actions || this.getAllActions();
        const set = new Set<ContentNode>(
            action.map(action => action.contentNode)
        );
        return Array.from(set);
    }

    /**@internal */
    findNodeById(id: string, actions?: LogicAction.Actions[]): ContentNode | null {
        const action = actions || this.getAllActions();
        return action.find(action => action.contentNode.id === id)?.contentNode || null;
    }

    /**@internal */
    findElementById(id: string, elements: LogicAction.GameElement[]): LogicAction.GameElement | null {
        return elements.find(element => element.id === id) || null;
    }

    /**
     * @internal
     * Find multiple elements by multiple IDs
     */
    findElementsByIds(ids: string[], elements: LogicAction.GameElement[]): LogicAction.GameElement[] {
        const map = new Map<string, LogicAction.GameElement>();
        elements.forEach(element => map.set(element.id, element));
        return ids.map(id => map.get(id)).filter(Boolean) as LogicAction.GameElement[];
    }

    public fromChained(chained: Proxied<GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chained.getActions();
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

