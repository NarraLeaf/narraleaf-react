import {Constructable} from "../action/constructable";
import {deepMerge, EventDispatcher, Serializer} from "@lib/util/data";
import {Color, ImageSrc} from "@core/types";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {EmptyObject} from "@core/elements/transition/type";
import {SrcManager} from "@core/action/srcManager";
import {Sound, SoundDataRaw, VoiceIdMap, VoiceSrcGenerator} from "@core/elements/sound";
import {DisplayableActionTypes, SceneActionContentType, SceneActionTypes} from "@core/action/actionTypes";
import {Image, ImageDataRaw} from "@core/elements/displayable/image";
import {Control, Persistent, Story} from "@core/common/core";
import {Chained, Proxied} from "@core/action/chain";
import {SceneAction} from "@core/action/actions/sceneAction";
import {ImageAction} from "@core/action/actions/imageAction";
import {SoundAction} from "@core/action/actions/soundAction";
import {ControlAction} from "@core/action/actions/controlAction";
import {Text} from "@core/elements/displayable/text";
import {DynamicPersistent} from "@core/elements/persistent";
import {Config, ConfigConstructor} from "@lib/util/config";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {Utils} from "@core/common/Utils";
import Actions = LogicAction.Actions;
import GameElement = LogicAction.GameElement;

/**@internal */
export type SceneConfig = {
    name: string;
    backgroundMusicFade: number;
    voices: VoiceIdMap | VoiceSrcGenerator | null;
};
/**@internal */
export type SceneState = {
    backgroundImage: Image;
    backgroundMusic: Sound | null;
};

export interface ISceneUserConfig {
    /**
     * Background music
     */
    backgroundMusic?: Sound | null;
    /**
     * Background music fade duration, in milliseconds
     */
    backgroundMusicFade?: number;
    /**
     * Voice map or a function that returns the voice URL
     */
    voices?: VoiceIdMap | VoiceSrcGenerator;
    background?: ImageSrc | Color;
}

export type JumpConfig = {
    transition: ImageTransition;
    unloadScene: boolean;
}

/**@internal */
type ChainableAction = Proxied<GameElement, Chained<LogicAction.Actions>> | Actions;
/**@internal */
type ChainedScene = Proxied<Scene, Chained<LogicAction.Actions>>;

/**@internal */
export type SceneDataRaw = {
    state: Record<string, any>,
}

/**@internal */
export type SceneEventTypes = {
    "event:scene.remove": [];
    "event:scene.load": [],
    "event:scene.unload": [],
    "event:scene.mount": [],
    "event:scene.unmount": [],
    "event:scene.preUnmount": [],
    "event:scene.imageLoaded": [],
    "event:scene.setBackgroundMusic": [Sound | null, number];
};

export class Scene extends Constructable<
    Actions,
    Scene
> {
    /**@internal */
    static EventTypes: { [K in keyof SceneEventTypes]: K } = {
        "event:scene.remove": "event:scene.remove",
        "event:scene.load": "event:scene.load",
        "event:scene.unload": "event:scene.unload",
        "event:scene.mount": "event:scene.mount",
        "event:scene.unmount": "event:scene.unmount",
        "event:scene.preUnmount": "event:scene.preUnmount",
        "event:scene.imageLoaded": "event:scene.imageLoaded",
        "event:scene.setBackgroundMusic": "event:scene.setBackgroundMusic",
    };
    /**@internal */
    static DefaultUserConfig = new ConfigConstructor<ISceneUserConfig, EmptyObject>({
        backgroundMusic: null,
        backgroundMusicFade: 0,
        voices: undefined,
        background: "#fff",
    });
    /**@internal */
    static DefaultSceneConfig = new ConfigConstructor<SceneConfig, EmptyObject>({
        name: "",
        backgroundMusicFade: 0,
        voices: null,
    });
    /**@internal */
    static DefaultSceneState = new ConfigConstructor<SceneState>({
        backgroundImage: new Image(),
        backgroundMusic: null,
    });

    /**@internal */
    static isScene(object: any): object is Scene {
        return object instanceof Scene;
    }

    /**@internal */
    static getScene(story: Story, targetScene: Scene | string): Scene | null {
        if (typeof targetScene === "string") {
            return story.getScene(targetScene);
        }
        return targetScene;
    }

    /**@internal */
    static getStateSerializer(scene: Scene) {
        return new Serializer<SceneState, {
            backgroundImage: (bg: Image) => ImageDataRaw;
            backgroundMusic: (sound: Sound | null) => SoundDataRaw | null;
        }>({
            backgroundImage: (bg) => bg.toData(),
            backgroundMusic: (sound) => sound?.toData() || null,
        }, {
            backgroundImage: (bg) =>
                scene.state.backgroundImage.fromData(bg),
            backgroundMusic: (sound) =>
                scene.state.backgroundMusic && sound
                    ? scene.state.backgroundMusic.fromData(sound)
                    : null,
        });
    }

    /**@internal */
    public config: SceneConfig;
    /**@internal */
    readonly srcManager: SrcManager = new SrcManager();
    /**@internal */
    readonly events: EventDispatcher<SceneEventTypes> = new EventDispatcher();
    /**@internal */
    public state: SceneState;
    /**@internal */
    private actions: (ChainableAction | ChainableAction[])[] | ((scene: Scene) => ChainableAction[]) = [];
    /**@internal */
    private sceneRoot?: SceneAction<"scene:action">;
    /**@internal */
    private readonly localPersistent: DynamicPersistent;
    /**@internal */
    private readonly userConfig: Config<ISceneUserConfig, EmptyObject>;

    public get local(): Persistent<any> {
        return this.localPersistent;
    }

    public get backgroundImage(): Image {
        return this.state.backgroundImage;
    }

    constructor(name: string, config?: Partial<ISceneUserConfig>) {
        super();

        const userConfig = Scene.DefaultUserConfig.create(config);
        const sceneConfig = Scene.DefaultSceneConfig.create({
            ...userConfig.get(),
            name,
        });

        this.userConfig = userConfig;
        this.config = sceneConfig.get();
        this.state = this.getInitialState();
        this.localPersistent = new DynamicPersistent(name);
    }

    /**
     * Set background, if {@link transition} is provided, it'll be applied
     * @chainable
     */
    public setBackground(background: Color | ImageSrc, transition?: ImageTransition): ChainedScene {
        const chain = this.chain();
        return chain.chain(this.state.backgroundImage._setSrc(chain, background, transition));
    }

    /**
     * Jump to the specified scene
     *
     * After calling the method, you **won't** be able to return to the context of the scene that called the jump,
     * so the scene will be unloaded
     *
     * Any operations after the jump operation won't be executed
     * @chainable
     */
    public jumpTo(scene: Scene, config: Partial<JumpConfig> = {}): ChainedScene {
        return this.combineActions(new Control(), chain => {
            const defaultJumpConfig: Partial<JumpConfig> = {unloadScene: true};
            const jumpConfig = deepMerge<JumpConfig>(defaultJumpConfig, config);
            chain
                .chain(new SceneAction<typeof SceneActionTypes.preUnmount>(
                    chain,
                    "scene:preUnmount",
                    new ContentNode<SceneActionContentType["scene:preUnmount"]>().setContent([])
                ))
                ._transitionToScene(jumpConfig.transition, scene)
                .chain(this._init(scene));
            if (jumpConfig.unloadScene) {
                chain.chain(this._exit());
            }
            return chain;
        })._jumpTo(scene);
    }

    /**
     * Wait for a period of time, the parameter can be the number of milliseconds or a Promise
     * @chainable
     */
    public sleep(ms: number): ChainedScene;

    public sleep(promise: Promise<any>): ChainedScene;

    public sleep(content: number | Promise<any>): ChainedScene {
        return this.chain(new SceneAction(
            this.chain(),
            "scene:sleep",
            new ContentNode().setContent(content)
        ));
    }

    /**
     * Set background music
     * @param sound Target music
     * @param fade If set, the fade-out effect will be applied to the previous music, and the fade-in effect will be applied to the current music, with a duration of {@link fade} milliseconds
     * @chainable
     */
    public setBackgroundMusic(sound: Sound | null, fade?: number): ChainedScene {
        return this.chain(new SceneAction<typeof SceneActionTypes["setBackgroundMusic"]>(
            this.chain(),
            SceneActionTypes["setBackgroundMusic"],
            new ContentNode<SceneActionContentType[typeof SceneActionTypes["setBackgroundMusic"]]>().setContent([sound, fade])
        ));
    }

    /**@internal */
    override toData(): SceneDataRaw | null {
        return {
            state: Scene.getStateSerializer(this).serialize(this.state),
        } satisfies SceneDataRaw;
    }

    /**@internal */
    override fromData(data: SceneDataRaw): this {
        this.state = Scene.getStateSerializer(this).deserialize(data.state);
        return this;
    }

    /**
     * Add actions to the scene
     */
    public action(actions: (ChainableAction | ChainableAction[])[]): this;

    public action(actions: ((scene: Scene) => ChainableAction[]) | (() => ChainableAction[])): this;

    public action(actions: (ChainableAction | ChainableAction[])[] | ((scene: Scene) => ChainableAction[]) | (() => ChainableAction[])): this {
        this.actions = actions;
        return this;
    }

    /**@internal */
    constructSceneRoot(story: Story): this {
        this.sceneRoot = new SceneAction<"scene:action">(
            this.chain(),
            "scene:action",
            new ContentNode(),
        );

        const actions = this.actions;
        const userChainedActions: ChainableAction[] = Array.isArray(actions) ? actions.flat(2) : actions(this).flat(2);
        const userActions = userChainedActions.map(v => {
            if (Chained.isChained(v)) {
                return v.fromChained(v as any);
            }
            return v;
        }).flat(2);

        const images: Image[] = [], texts: Text[] = [];
        this.getAllChildrenElements(story, userActions).forEach(element => {
            if (Chained.isChained(element)) {
                return;
            }
            if (element instanceof Image) {
                images.push(element);
            } else if (element instanceof Text) {
                texts.push(element);
            }
        });

        // disable auto initialization for wearables,
        // the scene can't initialize wearables,
        // they must be initialized by the image

        const
            nonWearableImages: Image[] = [],
            usedWearableImages: Image[] = [],
            wearableImagesMap = new Map<Image, Image>();
        images.forEach(image => {
            if (image.config.isWearable) {
                usedWearableImages.push(image);
            } else {
                nonWearableImages.push(image);
            }
            for (const wearable of image.config.wearables) {
                if (
                    wearableImagesMap.get(wearable)
                    && wearableImagesMap.get(wearable) !== image
                ) {
                    throw new Error("Wearable image cannot be used multiple times" +
                        "\nYou may bind the same wearable image to multiple parent images" +
                        "\nParent Conflict: " + wearableImagesMap.get(wearable)?.getId() +
                        "\nCurrent Parent: " + image.getId());
                }
                wearableImagesMap.set(wearable, image);
            }
        });

        const futureActions = [
            this._init(this),
            this._initBackground(),
            ...nonWearableImages
                .filter(image => image.config.autoInit)
                .map(image => image._init()),
            ...usedWearableImages.map(image => {
                if (!wearableImagesMap.has(image)) {
                    throw new Error("Wearable image must have a parent image");
                }
                return wearableImagesMap.get(image)!._initWearable(image);
            }),
            ...texts.map(text => (text as Text)._init()),
            ...userActions,
        ];

        const constructed = super.constructNodes(futureActions);
        const sceneRoot = new ContentNode<this>(this.sceneRoot, undefined, constructed || void 0).setContent(this);
        constructed?.setParent(sceneRoot);

        this.sceneRoot?.setContentNode(sceneRoot);

        return this;
    }

    /**@internal */
    isSceneRootConstructed(): boolean {
        return !!this.sceneRoot;
    }

    /**@internal */
    registerSrc(story: Story, seen: Set<Scene> = new Set<Scene>()) {
        if (!this.sceneRoot) {
            return;
        }

        const seenActions = new Set<Actions>();

        const seenJump = new Set<SceneAction<typeof SceneActionTypes["jumpTo"]>>();
        const queue: Actions[] = [this.sceneRoot];
        const futureScene = new Set<Scene>();

        while (queue.length) {
            const action = queue.shift()!;
            if (seenActions.has(action)) {
                continue;
            }
            seenActions.add(action);

            if (action instanceof SceneAction) {
                const currentScene = action.callee;
                if (Utils.isImageSrc(currentScene.state.backgroundImage.state.currentSrc)) {
                    this.srcManager.register({
                        type: "image",
                        src: Utils.srcToURL(currentScene.state.backgroundImage.state.currentSrc),
                    });
                }

                if (action.type === SceneActionTypes.jumpTo) {
                    const jumpTo = action as SceneAction<typeof SceneActionTypes["jumpTo"]>;
                    const scene = Scene.getScene(story, jumpTo.contentNode.getContent()[0]);
                    if (!scene) {
                        throw action._sceneNotFoundError(action.getSceneName(jumpTo.contentNode.getContent()[0]));
                    }

                    const background = SrcManager.getPreloadableSrc(story, action);
                    if (background) {
                        this.srcManager.register(background);
                    }

                    if (seenJump.has(jumpTo) || seen.has(scene)) {
                        continue;
                    }

                    seenJump.add(jumpTo);
                    futureScene.add(scene);
                    seen.add(scene);
                }
            } else if (action instanceof ImageAction) {
                const src = SrcManager.getPreloadableSrc(story, action);
                if (src) {
                    this.srcManager.register(src);
                }
            } else if (action instanceof SoundAction) {
                this.srcManager.register(action.callee);
            } else if (action instanceof ControlAction) {
                const controlAction = action as ControlAction;
                const actions = controlAction.getFutureActions(story);

                queue.push(...actions);
            } else if (action instanceof DisplayableAction) {
                this.srcManager.register(action.callee.srcManager.getSrc());
            }
            queue.push(...action.getFutureActions(story));
        }

        futureScene.forEach(scene => {
            scene.registerSrc(story, seen);
            this.srcManager.registerFuture(scene.srcManager);
        });
    }

    /**
     * @internal STILL IN DEVELOPMENT
     */
    assignActionId(story: Story) {
        const actions = this.getAllChildren(story, this.sceneRoot || []);

        actions.forEach((action, i) => {
            action.setId(`action-${i}`);
        });
    }

    /**
     * @internal STILL IN DEVELOPMENT
     */
    assignElementId(story: Story) {
        const elements = this.getAllChildrenElements(story, this.sceneRoot || []);

        elements.forEach((element, i) => {
            element.setId(`element-${i}`);
        });
    }

    /**@internal */
    getVoice(id: string | number | null): string | Sound | null {
        if (!id) {
            return null;
        }

        const voices = this.config.voices;
        if (voices) {
            if (typeof voices === "function") {
                return voices(id);
            }
            return voices[id] || null;
        }
        return null;
    }

    /**@internal */
    getSceneRoot(): SceneAction<"scene:action"> {
        if (!this.sceneRoot) {
            throw new Error("Scene root is not constructed");
        }
        return this.sceneRoot;
    }

    /**@internal */
    override reset() {
        this.state.backgroundImage.reset();
        this.state.backgroundMusic?.reset();
        this.state = this.getInitialState();
    }

    /**
     * Manually register an image to preload
     */
    public preloadImage(src: string) {
        if (!Utils.isImageSrc(src)) {
            throw new Error("Invalid image source: " + src);
        }
        this.srcManager.register({
            type: "image",
            src,
        });
    }

    private getInitialState(): SceneState {
        return Scene.DefaultSceneState.create().assign({
            backgroundImage: new Image({
                src: this.userConfig.get().background,
                opacity: 1,
                autoFit: true,
            }),
        }).get();
    }

    /**@internal */
    private _jumpTo(scene: Scene): ChainedScene {
        return this.chain(new SceneAction<"scene:jumpTo">(
            this.chain(),
            "scene:jumpTo",
            new ContentNode<SceneActionContentType["scene:jumpTo"]>().setContent([
                scene
            ])
        ));
    }

    /**@internal */
    private _exit(): SceneAction<"scene:exit"> {
        return new SceneAction(
            this.chain(),
            "scene:exit",
            new ContentNode().setContent([])
        );
    }

    /**@internal */
    private _transitionToScene(transition?: ImageTransition, scene?: Scene, src?: ImageSrc | Color): ChainedScene {
        const chain = this.chain();
        if (transition) {
            const action = new SceneAction<typeof SceneActionTypes["transitionToScene"]>(
                chain,
                SceneActionTypes["transitionToScene"],
                new ContentNode<SceneActionContentType[typeof SceneActionTypes["transitionToScene"]]>().setContent([
                    transition.copy() as ImageTransition,
                    scene,
                    src
                ])
            );
            chain.chain(action);
        }
        return chain;
    }

    /**@internal */
    private _init(target: Scene): SceneAction<"scene:init"> {
        return new SceneAction<"scene:init">(
            this.chain(),
            "scene:init",
            new ContentNode<SceneActionContentType["scene:init"]>().setContent([target])
        );
    }

    /**@internal */
    private _initBackground(): DisplayableAction<typeof DisplayableActionTypes.init, Image> {
        return this.state.backgroundImage._init(this);
    }
}

