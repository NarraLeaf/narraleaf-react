import {Constructable} from "../action/constructable";
import {deepMerge, EventDispatcher, Serializer} from "@lib/util/data";
import {Color, ImageSrc} from "@core/types";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {EmptyObject} from "@core/elements/transition/type";
import {SrcManager} from "@core/action/srcManager";
import {Sound, SoundDataRaw, SoundType, VoiceIdMap, VoiceSrcGenerator} from "@core/elements/sound";
import {SceneActionContentType, SceneActionTypes} from "@core/action/actionTypes";
import {Image, ImageDataRaw} from "@core/elements/displayable/image";
import {ActionStatements, Control, Persistent, Story, Transition} from "@core/common/core";
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
import {StaticScriptWarning, Utils} from "@core/common/Utils";
import {Layer} from "@core/elements/layer";
import { Narrator } from "./character";

/**@internal */
export type SceneConfig = {
    name: string;
    backgroundMusicFade: number;
    voices: VoiceIdMap | VoiceSrcGenerator | null;
    layers: Layer[];
    defaultBackgroundLayer: Layer;
    defaultDisplayableLayer: Layer;
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
    backgroundMusic: Sound | null;
    /**
     * Background music fade duration, in milliseconds
     */
    backgroundMusicFade: number;
    /**
     * Voice map or a function that returns the voice URL
     */
    voices?: VoiceIdMap | VoiceSrcGenerator;
    /**
     * Background src, can be a {@link Color} or an {@link Image}
     */
    background: ImageSrc | Color;
    /**
     * An array of {@link Layer}s
     */
    layers: Layer[];
}

export type JumpConfig = {
    transition: ImageTransition;
    unloadScene: boolean;
}

type ChainableAction = Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>> | LogicAction.Actions;
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
};

export class Scene extends Constructable<
    LogicAction.Actions,
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
    };
    /**@internal */
    static DefaultUserConfig = new ConfigConstructor<ISceneUserConfig, EmptyObject>({
        backgroundMusic: null,
        backgroundMusicFade: 0,
        voices: undefined,
        background: "#fff",
        layers: [],
    });
    /**@internal */
    static DefaultSceneConfig = new ConfigConstructor<SceneConfig, {
        voices: VoiceIdMap | VoiceSrcGenerator | null;
    }>({
        name: "",
        backgroundMusicFade: 0,
        voices: null,
        layers: [],
        defaultBackgroundLayer: new Layer("[[Background Layer]]", {
            zIndex: -1,
        }),
        defaultDisplayableLayer: new Layer("[[Displayable Layer]]", {
            zIndex: 0,
        }),
    }, {
        voices: (voices: VoiceIdMap | VoiceSrcGenerator | null) => {
            const isVoiceIdMap = (voices: any): voices is VoiceIdMap => {
                return typeof voices === "object" && voices !== null;
            };
            const isVoiceSrcGenerator = (voices: any): voices is VoiceSrcGenerator => {
                return typeof voices === "function";
            };
            if (!voices) {
                return null;
            }
            if (isVoiceIdMap(voices)) {
                Object.values(voices).forEach((value) => {
                    if (Sound.isSound(value)) {
                        Scene.validateVoice(value);
                    }
                });
            }
            if (isVoiceSrcGenerator(voices)) {
                return voices;
            }
            throw new StaticScriptWarning(
                `Invalid voices config: ${voices}`
            );
        },
    });

    /**@internal */
    static validateVoice(voice: Sound) {
        if (voice.config.type !== SoundType.Voice && voice.config.type !== SoundType.Sound) {
            throw new StaticScriptWarning(
                `Voice must be a voice, but got ${voice.config.type}. \n`
                + "To prevent unintended behavior and unexpected results, the sound have to be marked as voice. Please use `Sound.voice()` to create the sound."
            );
        }
    }

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
    private actions: ActionStatements | ((scene: Scene) => ActionStatements) = [];
    /**@internal */
    private sceneRoot?: SceneAction<"scene:action">;
    /**@internal */
    private readonly localPersistent: DynamicPersistent;
    /**@internal */
    private readonly userConfig: Config<ISceneUserConfig, EmptyObject>;
    /**@internal */
    private _futureActions_: LogicAction.Actions[] = [];

    /**@internal */
    get __futureActions__() {
        return this._futureActions_;
    }

    public get local(): Persistent<any> {
        return this.localPersistent;
    }

    public get background(): Image {
        return this.state.backgroundImage;
    }

    public get backgroundLayer(): Layer {
        return this.config.defaultBackgroundLayer;
    }

    public get displayableLayer(): Layer {
        return this.config.defaultDisplayableLayer;
    }

    constructor(name: string, config?: Partial<ISceneUserConfig>) {
        super();

        const defaultBackgroundLayer = Scene.DefaultSceneConfig
            .getDefaultConfig().defaultBackgroundLayer
            .copy()
            .setName("[[Background Layer of " + name + "]]");
        const defaultDisplayableLayer = Scene.DefaultSceneConfig
            .getDefaultConfig().defaultDisplayableLayer
            .copy()
            .setName("[[Displayable Layer of " + name + "]]");

        const userConfig = Scene.DefaultUserConfig.create(config);
        const sceneConfig = Scene.DefaultSceneConfig.create({
            ...userConfig.get(),
            name,
            layers: [
                ...userConfig.get().layers,
                defaultBackgroundLayer,
                defaultDisplayableLayer,
            ],
            defaultBackgroundLayer,
            defaultDisplayableLayer,
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
    public jumpTo(scene: Scene, config: Partial<JumpConfig> | JumpConfig["transition"] = {}): ChainableAction {
        return this.combineActions(new Control({
            allowFutureScene: false,
        }), chain => {
            const defaultJumpConfig: Partial<JumpConfig> = {unloadScene: true};
            const jumpConfig = deepMerge<JumpConfig>(defaultJumpConfig,
                config instanceof Transition
                    ? {transition: config} satisfies Partial<JumpConfig>
                    : config
            );
            chain
                .chain(new SceneAction<typeof SceneActionTypes.preUnmount>(
                    chain,
                    "scene:preUnmount",
                    new ContentNode<SceneActionContentType["scene:preUnmount"]>().setContent([])
                ))
                .chain(this._initScene(scene))
                ._transitionToScene(jumpConfig.transition, scene.state.backgroundImage.state.currentSrc);
            if (jumpConfig.unloadScene) {
                chain.chain(this._exit());
            }
            return chain;
        })._jumpTo(scene);
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

    /**
     * Add actions to the scene
     */
    public action(actions: ActionStatements): this;

    public action(actions: ((scene: Scene) => ActionStatements) | (() => ActionStatements)): this;

    public action(actions: ActionStatements | ((scene: Scene) => ActionStatements) | (() => ActionStatements)): this {
        this.actions = actions;
        return this;
    }

    /**
     * Manually register image sources
     */
    public preloadImage(src: string | string[]): this {
        if (!Utils.isImageSrc(src)) {
            throw new Error("Invalid image source: " + src);
        }
        const imageSrc = Array.isArray(src) ? src : [src];
        imageSrc.forEach(src => {
            this.srcManager.register({
                type: "image",
                src,
            });
        });

        return this;
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

    /**@internal */
    constructSceneRoot(story: Story): this {
        this.sceneRoot = new SceneAction<"scene:action">(
            this.chain(),
            "scene:action",
            new ContentNode(),
        );

        const actions = this.actions;
        const userChainedActions: ChainableAction[] = this.narrativeToActions(
            typeof actions === "function" ? actions(this) : actions
        );
        const userActions = userChainedActions.map(v => {
            if (Chained.isChained(v)) {
                return v.fromChained(v as any);
            }
            return v;
        }).flat(2);

        const images: Image[] = [], texts: Text[] = [];
        this.getAllChildrenElements(story, userActions, {allowFutureScene: false}).forEach(element => {
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
                if (image.config.autoInit) {
                    nonWearableImages.push(image);
                }
            }
            for (const wearable of image.config.wearables) {
                if (
                    wearableImagesMap.get(wearable)
                    && wearableImagesMap.get(wearable) !== image
                ) {
                    throw new Error("Wearable image cannot be used multiple times" +
                        "\nMaybe you bind the same wearable image to multiple parent images" +
                        "\nParent Conflict (src: " + wearableImagesMap.get(wearable)?.state.currentSrc + ")" +
                        "\nCurrent Parent (src: " + image.state.currentSrc + ")");
                }
                wearableImagesMap.set(wearable, image);
            }
        });

        const futureActions: LogicAction.Actions[] = [
            ...this._initScene(this),
            ...nonWearableImages
                .map(image => image._init(this)),
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
        this._futureActions_ = futureActions;

        return this;
    }

    /**@internal */
    narrativeToActions(statements: ActionStatements): LogicAction.Actions[] {
        return statements.flatMap(statement => {
            if (typeof statement === "string") {
                return Narrator.say(statement).getActions();
            }
            return Chained.toActions([statement]);
        });
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

        const seenActions = new Set<LogicAction.Actions>();

        const seenJump = new Set<SceneAction<typeof SceneActionTypes["jumpTo"]>>();
        const queue: LogicAction.Actions[] = [this.sceneRoot];
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
                const actions = controlAction.getFutureActions(story, {allowFutureScene: true});

                queue.push(...actions);
            } else if (action instanceof DisplayableAction) {
                this.srcManager.register(action.callee.srcManager.getSrc());
            }
            queue.push(...action.getFutureActions(story, {allowFutureScene: true}));
        }

        futureScene.forEach(scene => {
            scene.registerSrc(story, seen);
            this.srcManager.registerFuture(scene.srcManager);
        });
    }

    /**@internal */
    assignActionId(story: Story) {
        const actions = this.getAllChildren(story, this.sceneRoot || [], {allowFutureScene: true});

        actions.forEach((action, i) => {
            action.setId(`a-${i}`);
        });
    }

    /**@internal */
    assignElementId(story: Story) {
        const elements = this.getAllChildrenElements(story, this.sceneRoot || []);

        elements.forEach((element, i) => {
            element.setId(`e-${i}`);
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
                const voice = voices(id);
                if (typeof voice === "string") {
                    return voice;
                }
                Scene.validateVoice(voice);
                return voice;
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
    stringify(story: Story, seen: Set<LogicAction.Actions>, strict: boolean): string {
        return super.getAllChildren(
            story,
            this.sceneRoot || [],
            {allowFutureScene: true}
        ).map(action => action.stringify(story, seen, strict)).join(";");
    }

    /**@internal */
    override reset() {
        this.state.backgroundImage.reset();
        this.state.backgroundMusic?.reset();
        this.state = this.getInitialState();
    }

    /**@internal */
    private getInitialState(): SceneState {
        const userConfig = this.userConfig.get();
        if (userConfig.backgroundMusic && userConfig.backgroundMusic.config.type !== SoundType.Bgm) {
            throw new StaticScriptWarning(
                `[Scene: ${this.config.name}] Background music must be a bgm, but got ${userConfig.backgroundMusic.config.type}. \n`
                + "To prevent unintended behavior and unexpected results, the sound have to be marked as bgm. Please use `Sound.bgm()` to create the sound."
            );
        }

        return Scene.DefaultSceneState.create().assign({
            backgroundImage: this.state?.backgroundImage ? this.state.backgroundImage.reset() : (new Image({
                src: userConfig.background,
                opacity: 1,
                autoFit: true,
                name: `[[Background Image of ${this.config.name}]]`,
                layer: this.config.defaultBackgroundLayer,
            })._setIsBackground(true)),
            ...(userConfig.backgroundMusic ? {
                backgroundMusic: this.state?.backgroundMusic ? this.state.backgroundMusic.reset() : userConfig.backgroundMusic,
            } : {}),
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
    private _transitionToScene(transition?: ImageTransition, src?: ImageSrc | Color | []): ChainedScene {
        const chain = this.chain();
        if (transition && src) {
            const action = this.state.backgroundImage.char(src as any, transition);
            chain.chain((action as Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>).getActions());
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
    private _initScene(scene: Scene): LogicAction.Actions[] {
        return [
            scene._init(scene),
            ...scene.config.layers.flatMap(l => l._init(scene)),
            ...scene._initBackground(scene, scene.config.defaultBackgroundLayer),
        ];
    }

    /**@internal */
    private _initBackground(target: Scene, layer: Layer): LogicAction.Actions[] {
        return [
            target.state.backgroundImage._init(target, layer),
        ];
    }
}
