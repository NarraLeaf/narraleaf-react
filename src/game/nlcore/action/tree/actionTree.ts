import {LogicAction} from "@core/action/logicAction";

export enum NodeType {
    TreeNode = "TreeNode",
    ContentNode = "ContentNode",
}

export type RawData<T> = {
    id: string;
    data: T;
};

export class Node<C = any> {

    type: string;
    content: C | undefined;

    constructor(type: string) {
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

    action: LogicAction.Actions | null;
    private child?: RenderableNode | null;
    private parent: RenderableNode | null;

    constructor(
        callee?: LogicAction.Actions,
        parent?: RenderableNode | null,
        child?: RenderableNode
    ) {
        super(NodeType.ContentNode);
        this.child = child || null;
        this.parent = parent || null;
        this.action = callee || null;
    }

    setParent(parent: RenderableNode | null) {
        if (parent === this) {
            throw new Error("Cannot set parent to itself");
        }
        this.parent = parent;
        return this;
    }

    setChild(child: RenderableNode | null) {
        if (child === this) {
            throw new Error("Cannot set child to itself");
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
        super();
    }

    setParent(_: RenderableNode | null): this {
        throw new Error("Cannot set parent of root node");
    }

    remove(): this {
        throw new Error("Cannot remove root node");
    }

    forEach(callback: (node: RenderableNode) => void) {
        const queue = [this.getChild()];
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
            queue.push(node.getChild());
        }
    }
}

export type TreeNodeData = {
    id: string;
    data: any;
}

