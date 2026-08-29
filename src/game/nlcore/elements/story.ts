import {Constructable} from "../action/constructable";
import {deepMerge, fnv1a64, isPureObject} from "@lib/util/data";
import {Scene} from "@core/elements/scene";
import {RuntimeScriptError, StaticChecker, StaticScriptWarning} from "@core/common/Utils";
import {RawData} from "@core/action/tree/actionTree";
import {SceneAction} from "@core/action/actions/sceneAction";
import {LogicAction} from "@core/action/logicAction";
import {Persistent, PersistentContent} from "@core/elements/persistent";
import {Storable} from "@core/elements/persistent/storable";
import {Service} from "@core/elements/service";
import {Camera} from "@core/elements/camera";

export enum Origins {
    topLeft = "top left",
    topRight = "top right",
    bottomLeft = "bottom left",
    bottomRight = "bottom right",
}

export interface IStoryConfig {
    origin: Origins;
    /**
     * The story's stage {@link Camera}. Omit to use a default camera; provide one only to set the
     * initial pose. There is exactly one camera per story.
     */
    camera?: Camera;
}

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
    static MAX_DEPTH = 32767;

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
    /**@internal */
    private readonly _camera: Camera;
    /**
     * Element id to the JSON of what that element serialised to at the end of construction, i.e.
     * before any action ran. See {@link Story.captureElementBaseline}.
     * @internal
     */
    private elementBaseline: Map<string, string> | null = null;
    /**
     * The story's hash, per strictness, kept from one call to the next.
     *
     * {@link Story.hash} walks every action reachable from the entry scene, concatenates what
     * each one stringifies to and hashes the result - tens of milliseconds on a full-length
     * story, and it is asked for where it hurts most: `newGame()` stamps it into the new save's
     * metadata, so a player pressing Start pays for it before the first frame, and every save
     * pays for it again. Nothing can change the answer once {@link Story.constructStory} has
     * run, so the first caller computes it and the rest read it back. Only the hash is kept,
     * not the string it was taken over, which on a large story runs to megabytes.
     * @internal
     */
    private hashCache: Map<boolean, string> = new Map();

    constructor(name: string, config: Partial<IStoryConfig> = {}) {
        super();
        this.name = name;
        // The camera is a live element, not plain config data — keep it out of the deep merge that
        // clones the rest of the config, otherwise it would be flattened into a lifeless object.
        const {camera, ...rest} = config;
        this.config = deepMerge<IStoryConfig>(Story.defaultConfig, rest);
        this._camera = camera ?? new Camera();
    }

    /**
     * The story's stage camera.
     *
     * A single {@link Camera} that applies a transform and darken/color-grade to the whole stage
     * as one unit, persisting across scene changes. Author camera actions like any other element:
     * @example
     * ```ts
     * scene.action([
     *     story.camera.zoom(1.5, 600),
     *     story.camera.darken(0.5, 400),
     * ]);
     * ```
     */
    public get camera(): Camera {
        return this._camera;
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
     * Register a Persistent to the story
     *
     * You can't use a Persistent that isn't registered to the story
     */
    public registerPersistent(persistent: Persistent<any>): this {
        this.persistent.push(persistent);
        return this;
    }

    /**
     * Create a Persistent and register it to the story
     * @example
     * ```typescript
     * const persistent = story.createPersistent("playerData", {
     *   name: "persistent",
     * });
     * 
     * // is equivalent to
     * const persistent = new Persistent("playerData", {
     *   name: "persistent",
     * });
     * story.registerPersistent(persistent);
     * ```
     */
    public createPersistent<T extends PersistentContent>(namespace: string, defaultContent: T): Persistent<T> {
        const persistent = new Persistent(namespace, defaultContent);
        this.registerPersistent(persistent);
        
        return persistent;
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
    public getService<T extends Service>(name: string): T {
        const service = this.services.get(name);
        if (!service) {
            throw new StaticScriptWarning(`Trying to access service ${name} before it's registered, please use "story.registerService" to register the service`);
        }
        return service as T;
    }

    /**
     * Returns a 64-bit hash of the story
     * 
     * The hash is calculated by the stringified story.
     * 
     * If `strict` is true, the hash will be calculated by the stringified story with strict mode.
     * 
     * In strict mode, the hash will be calculated
     * - With all the Lambda functions stringified (If the lambda function is changed, the hash will be different)
     * 
     * However, the hash is **not** calculated with the text content of the story.
     */
    public hash(strict: boolean = false): string {
        const cached = this.hashCache.get(strict);
        if (cached !== undefined) {
            return cached;
        }
        const computed = fnv1a64(this.stringify(strict));
        this.hashCache.set(strict, computed);
        return computed;
    }

    public stringify(strict: boolean = false): string {
        return this.entryScene?.stringify(this, new Set(), strict) || "";
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

        // Constructing a second time can reach a different set of actions, which makes whatever
        // the last construction hashed no longer an answer about this one.
        this.hashCache.clear();

        this.constructSceneRoots(scene);
        scene.registerSrc(this);
        scene.assignActionId(this);
        scene.assignElementId(this);

        this.runStaticCheck(scene);
        this.captureElementBaseline();
        return this;
    }

    /**
     * What every element serialises to before a single action has run - the state the script wrote.
     *
     * Captured once, at the end of construction, and compared against on every save so that an
     * element still standing where the author put it can be left out of it. Ids are already
     * assigned by this point (`assignElementId`, just above).
     * @internal
     */
    private captureElementBaseline(): void {
        const baseline = new Map<string, string>();
        this.getAllChildrenElements(this, this.entryScene?.getSceneRoot() || []).forEach(element => {
            const data = element.toData();
            if (data) {
                baseline.set(element.getId(), JSON.stringify(data));
            }
        });
        this.elementBaseline = baseline;
    }

    /**
     * The elements a save has to carry: those whose state no longer matches what the script wrote.
     *
     * A story reaches every element of every scene it can jump to, so serialising all of them puts
     * the whole cast into every save and into every per-line history snapshot - a cost that grows
     * with the size of the project rather than with what is on stage. Everything a scene put on
     * stage is returned to its authored state when that scene is left, so in practice the elements
     * that differ are the ones the current scene is using, plus the few that outlive a scene by
     * design (the story camera, sounds still playing).
     *
     * Leaving an element out is not a loss of information: {@link LiveGame.deserialize} returns
     * every element to its authored state before applying a save, so an element the save does not
     * name is restored by being reset.
     *
     * The dirty flag only narrows which elements are worth serialising; whether one reaches the save
     * is decided by comparing it against the baseline, so a flag left standing costs a comparison
     * rather than a wrong save.
     * @internal
     */
    getAllElementStates(): RawData<ElementStateRaw>[] {
        const elements = this.getAllChildrenElements(this, this.entryScene?.getSceneRoot() || []);
        const baseline = this.elementBaseline;
        const states: RawData<ElementStateRaw>[] = [];

        for (const element of elements) {
            // Without a baseline (a story that was never constructed) there is nothing to compare
            // against, so every element is carried, exactly as before this was introduced.
            if (baseline && !element.isDirty()) {
                continue;
            }

            const data = element.toData();
            if (!data) {
                continue;
            }
            if (baseline && JSON.stringify(data) === baseline.get(element.getId())) {
                continue;
            }
            states.push({id: element.getId(), data});
        }
        return states;
    }

    /**
     * Every element whose state has drifted from what the script wrote *without* being marked dirty
     * - the one failure mode that would silently drop state from a save.
     *
     * This is the full walk the dirty flag exists to avoid, so it is only ever run as an audit (see
     * {@link LiveGame.auditElementDirtyMarks}, which runs it periodically in debug builds), never on
     * the path that writes a save.
     * @internal
     */
    findUnmarkedElements(): LogicAction.GameElement[] {
        const baseline = this.elementBaseline;
        if (!baseline) {
            return [];
        }

        return this.getAllChildrenElements(this, this.entryScene?.getSceneRoot() || [])
            .filter(element => {
                if (element.isDirty()) {
                    return false;
                }
                const data = element.toData();
                return !!data && JSON.stringify(data) !== baseline.get(element.getId());
            });
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

