import {Constructable} from "../action/constructable";
import {deepMerge} from "@lib/util/data";
import {Scene} from "@core/elements/scene";
import {RuntimeScriptError, StaticChecker} from "@core/common/Utils";
import {RawData} from "@core/action/tree/actionTree";
import {SceneAction} from "@core/action/actions/sceneAction";
import {LogicAction} from "@core/action/logicAction";
import {Persistent} from "@core/elements/persistent";
import {Storable} from "@core/elements/persistent/storable";

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type StoryConfig = {};
/**@internal */
export type ElementStateRaw = Record<string, any>;

export class Story extends Constructable<
    SceneAction<"scene:action">,
    Story
> {
    /**@internal */
    static defaultConfig: StoryConfig = {};
    /**@internal */
    static MAX_DEPTH = 10000;

    /**@internal */
    readonly name: string;
    /**@internal */
    readonly config: StoryConfig;
    /**@internal */
    entryScene: Scene | null = null;
    /**@internal */
    scenes: Map<string, Scene> = new Map();
    /**@internal */
    persistent: Persistent<any>[] = [];

    constructor(name: string, config: StoryConfig = {}) {
        super();
        this.name = name;
        this.config = deepMerge<StoryConfig>(Story.defaultConfig, config);
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
        this.entryScene = scene;
        return this;
    }

    /**
     * Register a scene to the story
     * @example
     * ```typescript
     * // register a scene
     * const story = new Story("story");
     * const scene1 = new Scene("scene1");
     * const scene2 = new Scene("scene2");
     *
     * story.register(scene1); // Register scene1
     *
     * scene2.action([
     *   scene2.jump("scene1") // Jump to scene1
     * ]);
     * ```
     */
    public registerScene(name: string, scene: Scene): this;
    public registerScene(scene: Scene): this;
    public registerScene(arg0: string | Scene, arg1?: Scene): this {
        const name = typeof arg0 === "string" ? arg0 : arg0.name;
        const scene = typeof arg0 === "string" ? arg1! : arg0;

        if (this.scenes.has(name) && this.scenes.get(name) !== scene) {
            throw new Error(`Scene with name ${name} already exists when registering scene`);
        }
        this.scenes.set(name, scene);
        return this;
    }

    /**
     * Register a Persistent to the story
     *
     * You can't use a Persistent that isn't registered to the story
     */
    public registerPersistent(persistent: Persistent<any>): this {
        this.persistent.push(persistent);
        return this;
    }

    /**
     * @internal
     */
    getScene(name: string | Scene, assert: true, error?: (message: string) => Error): Scene;
    getScene(name: string | Scene, assert?: false): Scene | null;
    getScene(name: string | Scene, assert = false, error?: (message: string) => Error): Scene | null {
        if (Scene.isScene(name)) return name;
        const scene = this.scenes.get(name) || null;
        if (!scene && assert) {
            const constructor = error || RuntimeScriptError;
            throw Reflect.construct(constructor, [`Scene with name ${name} not found`]);
        }
        return scene;
    }

    /**@internal */
    constructStory(): this {
        const scene = this.entryScene;

        if (!scene) {
            throw new Error("Story must have an entry scene");
        }

        this.constructSceneRoots(scene);
        scene.registerSrc(this);
        scene.assignActionId(this);
        scene.assignElementId(this);

        this.runStaticCheck(scene);
        return this;
    }

    /**@internal */
    getAllElementStates(): RawData<ElementStateRaw>[] {
        const elements = this.getAllChildrenElements(this, this.entryScene?.getSceneRoot() || []);
        return elements
            .map(e => {
                return {
                    id: e.getId(),
                    data: e.toData()
                };
            })
            .filter(e => !!e.data);
    }

    /**@internal */
    constructSceneRoots(entryScene: Scene): this {
        const seen = new Set<Scene>();
        const queue: LogicAction.Actions[] = [];
        let depth = 0;

        entryScene.constructSceneRoot(this);
        queue.push(entryScene.getSceneRoot());

        while (queue.length) {
            depth++;
            if (depth > Story.MAX_DEPTH) {
                throw new Error(`Max depth reached while constructing scene roots (max depth: ${Story.MAX_DEPTH})`);
            }

            const action = queue.shift()!;
            if (Scene.isScene(action.callee)) {
                if (seen.has(action.callee)) {
                    continue;
                }
                if (!action.callee.isSceneRootConstructed()) {
                    action.callee.constructSceneRoot(this);
                }
                seen.add(action.callee);
            }

            const children = action.getFutureActions(this);
            queue.push(...children);
        }
        return this;
    }

    /**@internal */
    initPersistent(storable: Storable): this {
        this.persistent.forEach(persistent => {
            persistent.init(storable);
        });
        return this;
    }

    /**@internal */
    private runStaticCheck(scene: Scene) {
        return new StaticChecker(scene).run(this);
    }
}

