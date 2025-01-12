import {RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Chainable, Chained, Proxied} from "@core/action/chain";
import type {Story} from "@core/elements/story";
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
    forEachChild(story: Story, actionOrActions: LogicAction.Actions | LogicAction.Actions[], cb: ((action: LogicAction.Actions) => void)): void {
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

            const children = action.getFutureActions(story).filter(action => !seen.has(action));
            queue.push(...children);
        }
    }

    /**@internal */
    getAllChildren(story: Story, action: LogicAction.Actions | LogicAction.Actions[]): LogicAction.Actions[] {
        const children: LogicAction.Actions[] = [];
        this.forEachChild(story, action, action => children.push(action));
        return children;
    }

    /**@internal */
    getAllChildrenMap(story: Story, action: LogicAction.Actions | LogicAction.Actions[]): Map<string, LogicAction.Actions> {
        const map = new Map<string, LogicAction.Actions>();
        this.forEachChild(story, action, action => map.set(action.getId(), action));
        return map;
    }

    /**@internal */
    getAllElementMap(story: Story, action: LogicAction.Actions | LogicAction.Actions[]): Map<string, LogicAction.GameElement> {
        const map = new Map<string, LogicAction.GameElement>();
        this.forEachChild(story, action, action => map.set(action.callee.getId(), action.callee));
        return map;
    }

    /**@internal */
    getAllChildrenElements(story: Story, action: LogicAction.Actions | LogicAction.Actions[]): LogicAction.GameElement[] {
        return Array.from(new Set(this.getAllChildren(story, action).map(action => action.callee)));
    }

    /**@internal */
    toData(): Record<string, any> | null {
        return null;
    }

    /**
     * Construct the actions into a tree
     * @internal
     */
    protected constructNodes(actions: LogicAction.Actions[], parent?: RenderableNode): RenderableNode | null {
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            if (i === 0 && parent) {
                parent.setChild(action.contentNode);
            } else if (i > 0) {
                (actions[i - 1].contentNode)?.setChild(action.contentNode);
            }
        }
        return (actions.length) ? actions[0].contentNode : null;
    }
}

