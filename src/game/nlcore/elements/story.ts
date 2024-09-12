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
    any,
    SceneAction<"scene:action">,
    StoryAction<"story:action">
> {
    static defaultConfig: StoryConfig = {};
    static targetAction = StoryAction;
    readonly id: string;
    readonly name: string;
    readonly config: StoryConfig;

    constructor(name: string, config: StoryConfig = {}) {
        super();
        this.id = Game.getIdManager().getStringId();
        this.name = name;
        this.config = deepMerge<StoryConfig>(Story.defaultConfig, config);
    }

    /**@internal */
    setAllElementState(data: RawData<ElementStateRaw>[], actions?: LogicAction.Actions[]): void {
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
    getAllElementState(actions?: LogicAction.Actions[]): RawData<ElementStateRaw>[] {
        const action = actions || this.getAllActions();
        const allCallee = this.getAllElements(action);
        return allCallee.map(callee => ({
            id: callee.id,
            data: callee.toData()
        })).filter(data => data.data !== null) as RawData<ElementStateRaw>[];
    }

    /**
     * @internal
     * 生成节点子辈ID映射
     * 键是节点ID，值是子节点ID
     */
    getNodeChildIdMap(actions?: LogicAction.Actions[]): NodeChildIdMap {
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
     * 使用指定的映射表还原节点子辈
     */
    setNodeChildByMap(map: NodeChildIdMap | Record<string, string>, actions?: LogicAction.Actions[]): void {
        if (!map) {
            return;
        }
        const childMap = map instanceof Map ? map : new Map(Object.entries(map));

        const action = actions || this.getAllActions();
        const mappedNodes = this.getMappedNodes(this.getAllNodes(action));
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
     * 生成节点ID映射
     */
    getMappedNodes(nodes: RenderableNode[]): Map<string, RenderableNode> {
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

    public entry(scene: Scene): this {
        const actions = scene._sceneRoot;
        if (!actions) {
            throw new Error("No actions in scene, please add actions to scene first");
        }

        this.setActions([actions]);
        scene.registerSrc();
        new StaticChecker(scene).start();
        return this;
    }
}

