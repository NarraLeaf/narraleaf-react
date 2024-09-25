import {Constructable} from "../action/constructable";
import {Game, LogicAction} from "../game";
import {deepMerge} from "@lib/util/data";
import {SceneAction, StoryAction} from "@core/action/actions";
import {RawData, RenderableNode} from "@core/action/tree/actionTree";
import {Scene} from "@core/elements/scene";
import {StaticChecker} from "@core/common/Utils";

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type StoryConfig = {};
export type ElementStateRaw = Record<string, any>;
export type NodeChildIdMap = Map<string, string>;

export class Story extends Constructable<
    SceneAction<"scene:action">
> {
    static defaultConfig: StoryConfig = {};
    static targetAction = StoryAction;
    readonly id: string;
    readonly name: string;
    readonly config: StoryConfig;
    entryScene: Scene | null = null;

    constructor(name: string, config: StoryConfig = {}) {
        super();
        this.id = Game.getIdManager().getStringId();
        this.name = name;
        this.config = deepMerge<StoryConfig>(Story.defaultConfig, config);
    }

    /**@internal */
    _setAllElementState(data: RawData<ElementStateRaw>[], actions?: LogicAction.Actions[]): void {
        const action = actions || this.getAllActions();
        const map = new Map<string, any>();

        data.forEach(data => map.set(data.id, data.data));

        const allCallee = this.getAllElements(action);
        allCallee.forEach(callee => {
            const state = map.get(callee.id);
            if (state) {
                (callee).fromData(state);
            }
        });
    }

    /**@internal */
    _getAllElementState(actions?: LogicAction.Actions[]): RawData<ElementStateRaw>[] {
        const action = actions || this.getAllActions();
        const allCallee = this.getAllElements(action);
        return allCallee.map(callee => ({
            id: callee.id,
            data: callee.toData()
        })).filter(data => data.data !== null) as RawData<ElementStateRaw>[];
    }

    /**
     * @internal
     * Generate node descendant ID mapping
     * The key is the node ID, and the value is the child node ID
     */
    _getNodeChildIdMap(actions?: LogicAction.Actions[]): NodeChildIdMap {
        const action = actions || this.getAllActions();
        const map: NodeChildIdMap = new Map<string, string>();
        action.forEach(action => {
            const node = action.contentNode;
            if (node.child?.id
                && node.initChild !== node.child) {
                // 只添加被追踪的更改的子节点，未更改子节点的节点不会被添加
                // 用于缩小映射体积
                map.set(node.id, node.child.id);
            }
        });
        return map;
    }

    /**
     * @internal
     * Use the specified mapping table to restore the node descendants
     */
    _setNodeChildByMap(map: NodeChildIdMap | Record<string, string>, actions?: LogicAction.Actions[]): void {
        if (!map) {
            return;
        }
        const childMap = map instanceof Map ? map : new Map(Object.entries(map));

        const action = actions || this.getAllActions();
        const mappedNodes = this._getMappedNodes(this.getAllNodes(action));
        action.forEach(action => {
            const node = action.contentNode;
            const childId = childMap.get(node.id);
            const child = childId && mappedNodes.get(childId);
            if (child) {
                node.setChild(child);
            }
        });
    }

    /**
     * @internal
     * Generate node ID mapping
     */
    _getMappedNodes(nodes: RenderableNode[]): Map<string, RenderableNode> {
        const map = new Map<string, RenderableNode>();
        nodes.forEach(node => map.set(node.id, node));
        return map;
    }

    toData() {
        return null;
    }

    fromData(_: any) {
        return this;
    }

    /**
     * Set the entry scene of the story
     * @example
     * ```typescript
     * const story = new Story("story");
     * const scene = new Scene("scene");
     * story.entry(scene); // The story will start from this scene
     * ```
     */
    public entry(scene: Scene): this {
        const actions = scene.sceneRoot;
        if (!actions) {
            throw new Error("No actions in scene, please add actions to scene first");
        }

        this.entryScene = scene;
        scene.registerSrc();
        new StaticChecker(scene).run();
        return this;
    }
}

