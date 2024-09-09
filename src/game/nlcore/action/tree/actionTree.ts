import {LogicAction} from "@lib/game/game/logicAction";
import {Game} from "@lib/game/game/game";

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

    getContent() {
        return this.content;
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
        let current = node;
        while (current) {
            if (seen.has(current)) {
                break;
            }
            seen.add(current);
            callback(current);
            current = current.parent;
        }
    }

    static forEachChild(node: RenderableNode, callback: (node: RenderableNode) => void) {
        const seen: Set<RenderableNode> = new Set();
        let current = node;
        while (current) {
            if (seen.has(current)) {
                break;
            }
            seen.add(current);
            callback(current);
            current = current.child;
        }
    }

    child?: RenderableNode | null;
    initChild?: RenderableNode | null;
    parent: RenderableNode | null;
    action: LogicAction.Actions;

    constructor(
        id: string,
        child?: RenderableNode,
        parent?: RenderableNode | null,
        callee?: LogicAction.Actions
    ) {
        super(Game.getIdManager().prefix("node", id, "-"), NodeType.ContentNode);
        this.child = child || null;
        this.parent = parent || null;
        this.action = callee
    }

    setParent(parent: RenderableNode | null) {
        if (parent === this) {
            throw new Error('Cannot set parent to itself');
        }
        this.parent = parent;
        return this;
    }

    setChild(child: RenderableNode) {
        if (child === this) {
            throw new Error('Cannot set child to itself');
        }
        this.child = child;
        if (child && child.parent !== this) {
            child.remove().setParent(this);
        }
        return this;
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
    public addChild(child: RenderableNode) {
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

    toData(): RenderableNodeData {
        const content = this.getContent();
        return {
            id: this.id,

            // use toData if it exists
            data: (typeof content === 'object' && content !== null) ?
                (typeof content["toData"] === "function" ? content["toData"] : content) : content,
        };
    }

    fromData(data: RenderableNodeData) {
        const content = this.getContent();
        if (
            typeof content === 'object'
            && content !== null
            && typeof content["fromData"] === "function"
        ) {
            content["fromData"](content);
        } else {
            this.setContent(data.data);
        }
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
            if (node instanceof ContentNode) {
                queue.push(node.child);
            }
        }
    }
}

export type TreeNodeData = {
    id: string;
    data: any;
}

