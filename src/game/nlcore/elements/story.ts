import {Constructable} from "../action/constructable";
import {deepMerge, isPureObject} from "@lib/util/data";
import {Scene} from "@core/elements/scene";
import {RuntimeScriptError, StaticChecker, StaticScriptWarning} from "@core/common/Utils";
import {RawData} from "@core/action/tree/actionTree";
import {SceneAction} from "@core/action/actions/sceneAction";
import {LogicAction} from "@core/action/logicAction";
import {Persistent} from "@core/elements/persistent";
import {Storable} from "@core/elements/persistent/storable";
import {Service} from "@core/elements/service";

export enum Origins {
    topLeft = "top left",
    topRight = "top right",
    bottomLeft = "bottom left",
    bottomRight = "bottom right",
}

export interface IStoryConfig {
    origin: Origins;
}

/**@internal */
export type ElementStateRaw = Record<string, any>;

export class Story extends Constructable<
    SceneAction<"scene:action">,
    Story
> {
    /**@internal */
    static defaultConfig: IStoryConfig = {
        origin: Origins.bottomLeft,
    };
    /**@internal */
    static MAX_DEPTH = 10000;

    /**@internal */
    public static empty(): Story {
        return new Story("empty").entry(new Scene("empty"));
    }

    /**@internal */
    readonly name: string;
    /**@internal */
    readonly config: IStoryConfig;
    /**@internal */
    entryScene: Scene | null = null;
    /**@internal */
    scenes: Map<string, Scene> = new Map();
    /**@internal */
    persistent: Persistent<any>[] = [];
    /**@internal */
    services: Map<string, Service> = new Map();

    constructor(name: string, config: IStoryConfig = Story.defaultConfig) {
        super();
        this.name = name;
        this.config = deepMerge<IStoryConfig>(Story.defaultConfig, config);
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
        const name = typeof arg0 === "string" ? arg0 : arg0.config.name;
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
     * Register a Service to the story
     *
     * **Note**: service name should be unique
     */
    public registerService(name: string, service: Service): this {
        this.services.set(name, service);
        return this;
    }

    /**
     * Get a registered service, throw an error if the service isn't found
     */
    public getService(name: string): Service {
        const service = this.services.get(name);
        if (!service) {
            throw new StaticScriptWarning(`Trying to access service ${name} before it's registered, please use "story.registerService" to register the service`);
        }
        return service;
    }

    /**@internal */
    serializeServices(): { [key: string]: unknown } {
        const services: { [key: string]: unknown } = {};
        this.services.forEach((service, key) => {
            if (!service.serialize || typeof service.serialize !== "function") {
                return;
            }

            const res = service.serialize();
            if (res === null) {
                return;
            } else if (res instanceof Promise) {
                throw new RuntimeScriptError(`Service ${key} serialize method should not return a promise`);
            } else if (!isPureObject(res)) {
                throw new RuntimeScriptError(`Service ${key} serialize method should return a pure object. \n` +
                    "A pure object should:\n" +
                    "1. be an object literal\n" +
                    "2. not have any prototype\n" +
                    "3. no circular reference\n" +
                    "4. sub objects should also be pure objects or serializable data\n" +
                    "Return null if nothing needs to be saved. For more information, see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#description\n" +
                    `Returned value ${res} violates the above rules`
                );
            }
            services[key] = res;
        });
        return services;
    }

    /**@internal */
    deserializeServices(data: { [key: string]: unknown }) {
        this.services.forEach((service, key) => {
            if (!service.deserialize || typeof service.deserialize !== "function") {
                return;
            }
            if (data[key]) {
                service.deserialize(data[key] as any);
            }
        });
    }

    /**@internal */
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

            const children = action.getFutureActions(this, {allowFutureScene: true});
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
    getInversionConfig(): { invertY: boolean; invertX: boolean } {
        const {origin} = this.config;
        return {
            invertY: origin === Origins.bottomLeft || origin === Origins.bottomRight,
            invertX: origin === Origins.bottomRight || origin === Origins.topRight,
        };
    }

    /**@internal */
    private runStaticCheck(scene: Scene) {
        return new StaticChecker(scene).run(this);
    }
}

