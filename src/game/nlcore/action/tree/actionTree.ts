import {LogicAction} from "@core/action/logicAction";
import {Game} from "@core/game";

export enum NodeType {
    TreeNode = "TreeNode",
    ContentNode = "ContentNode",
}

export type RawData<T> = {
    id: string;
    data: T;
};

export class Node<C = any> {
    id: string;
    type: string;
    content: C | undefined;

    constructor(id: string, type: string) {
        this.id = id;
        this.type = type;
        this.content = undefined;
    }

    setContent(content: C) {
        this.content = content;
        return this;
    }

    getContent(): C {
        return this.content!;
    }
}

export type RenderableNode = ContentNode;
export type RenderableNodeData = ContentNodeData | TreeNodeData;

export type ContentNodeData = {
    id: string;
    data: any;
}

export class ContentNode<T = any> extends Node<T> {
    static forEachParent(node: RenderableNode, callback: (node: RenderableNode) => void) {
        const seen: Set<RenderableNode> = new Set();
        let current: RenderableNode | null = node;
        while (current) {
            if (seen.has(current)) {
                break;
            }
            seen.add(current);
            callback(current);
            current = current.getParent();
        }
    }

    static forEachChild(node: RenderableNode, callback: (node: RenderableNode) => void) {
        const seen: Set<RenderableNode> = new Set();
        let current: RenderableNode | null = node;
        while (current) {
            if (seen.has(current)) {
                break;
            }
            seen.add(current);
            callback(current);
            current = current.getChild();
        }
    }

    child?: RenderableNode | null;
    initChild?: RenderableNode | null;
    parent: RenderableNode | null;
    action: LogicAction.Actions | null;

    constructor(
        id: string,
        callee?: LogicAction.Actions,
        parent?: RenderableNode | null,
        child?: RenderableNode
    ) {
        super(Game.getIdManager().prefix("node", id, "-"), NodeType.ContentNode);
        this.child = child || null;
        this.parent = parent || null;
        this.action = callee || null;
    }

    setParent(parent: RenderableNode | null) {
        if (parent === this) {
            throw new Error('Cannot set parent to itself');
        }
        this.parent = parent;
        return this;
    }

    setChild(child: RenderableNode | null) {
        if (child === this) {
            throw new Error('Cannot set child to itself');
        }
        this.child = child;
        if (child && child.parent !== this) {
            child.remove().setParent(this);
        }
        return this;
    }

    getChild(): RenderableNode | null {
        return this.child || null;
    }

    getParent(): RenderableNode | null {
        return this.parent || null;
    }

    /**
     * To track the changes of the child
     * should only be called when constructing the tree
     */
    setInitChild(child: RenderableNode) {
        this.initChild = child;
        return this.setChild(child);
    }

    /**
     * Public method for setting the content of the node
     * should only be called when changing the state in-game
     */
    public addChild(child: RenderableNode | null) {
        this.setChild(child);
        return this;
    }

    removeChild(child: RenderableNode | null) {
        if (child && this.child === child) {
            this.child = null;
            child.setParent(null);
        } else if (!child) {
            this.child = null;
        }
        return this;
    }

    /**
     * Remove this node from the parent's children
     */
    remove() {
        this.parent?.removeChild(this);
        return this;
    }

    hasChild() {
        return !!this.child;
    }
}

export class RootNode extends ContentNode {
    constructor() {
        super('root');
    }

    setParent(_: RenderableNode | null): this {
        throw new Error('Cannot set parent of root node');
    }

    remove(): this {
        throw new Error('Cannot remove root node');
    }

    forEach(callback: (node: RenderableNode) => void) {
        const queue = [this.child];
        const seen: Set<RenderableNode> = new Set();
        while (queue.length > 0) {
            const node = queue.shift();
            if (!node) {
                continue;
            }
            if (seen.has(node)) {
                continue;
            }
            seen.add(node);
            callback(node);
            queue.push(node.child);
        }
    }
}

export type TreeNodeData = {
    id: string;
    data: any;
}

