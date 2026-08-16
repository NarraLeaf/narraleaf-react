import {Constructable} from "../action/constructable";
import {deepMerge, EventDispatcher, Serializer} from "@lib/util/data";
import {Color, ImageSrc} from "@core/types";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {EmptyObject} from "@core/elements/transition/type";
import {SrcManager} from "@core/action/srcManager";
import {Sound, SoundDataRaw, VoiceIdMap, VoiceSrcGenerator} from "@core/elements/sound";
import {acceptsAudioBus, DefaultAudioBusIds} from "@core/game/audioBus";
import {CharacterActionTypes, ControlActionTypes, SceneActionContentType, SceneActionTypes} from "@core/action/actionTypes";
import {Image, ImageDataRaw} from "@core/elements/displayable/image";
import {Control} from "@core/elements/control";
import {Chained, Proxied} from "@core/action/chain";
import {SceneAction} from "@core/action/actions/sceneAction";
import {ImageAction} from "@core/action/actions/imageAction";
import {SoundAction} from "@core/action/actions/soundAction";
import {CharacterAction} from "@core/action/actions/characterAction";
import {collectStaticAvatarSources} from "@core/elements/character/avatar";
import {ControlAction} from "@core/action/actions/controlAction";
import {Text} from "@core/elements/displayable/text";
import {Puppet} from "@core/elements/displayable/puppet";
import {DynamicPersistent} from "@core/elements/persistent";
import {Config, ConfigConstructor} from "@lib/util/config";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {StaticScriptWarning, Utils} from "@core/common/Utils";
import {Layer} from "@core/elements/layer";
import { Narrator } from "./character";
import type { Sentence } from "@core/elements/character/sentence";
import { NVLToken } from "./nvl";
import type { TransformDefinitions } from "@core/elements/transform/type";
import type { NvlBlockOptions } from "@core/action/actionTypes";
import type {ActionStatements} from "@core/elements/type";
import type {Persistent} from "@core/elements/persistent";
import type {Story} from "@core/elements/story";
import {Transition} from "@core/elements/transition/transition";

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
    /**
     * Played across the whole stage while the scenes swap: the outgoing scene drives the
     * transition's outgoing half and the incoming scene its incoming half, so sprites, text and
     * every other layer take part rather than only the background.
     *
     * The dialogue box is deliberately not part of it — it is rendered outside the stage and is
     * expected to be gone by the time a scene ends.
     */
    transition: Transition;
}

type ChainableAction = Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>> | LogicAction.Actions;
type ChainedScene = Proxied<Scene, Chained<LogicAction.Actions>>;

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
    private static _defaultSceneConfig: ConfigConstructor<SceneConfig, {
        voices: VoiceIdMap | VoiceSrcGenerator | null;
    }> | null = null;

    /**
     * Built on first use rather than while this module is evaluating.
     *
     * This one has to be lazy for a stronger reason than the displayables' configs: it *constructs*
     * two `Layer`s, and a `Layer` constructor reads `Layer.DefaultUserConfig`, which reads
     * `TransformState` from another module. This module sits in a cycle with that one, so building
     * the config at evaluation time meant reading `TransformState` before it had been assigned —
     * `Cannot read properties of undefined (reading 'DefaultTransformState')`, thrown from a stack
     * naming neither module. Making the displayables' own configs lazy does not help here, because
     * the `new Layer(...)` below reaches them at exactly the same moment.
     *
     * @internal
     */
    static get DefaultSceneConfig(): ConfigConstructor<SceneConfig, {
        voices: VoiceIdMap | VoiceSrcGenerator | null;
    }> {
        return (Scene._defaultSceneConfig ??= new ConfigConstructor<SceneConfig, {
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
        }));
    }

    /**
     * A voice clip has to sit on the voice bus or the sfx bus - or **anywhere beneath either**.
     *
     * The descendant check is what makes per-character voice possible at all: `alice` under
     * `voice` is a voice, and an equality test said it was not, which failed story compile before
     * a single sample was ever loaded.
     *
     * A bus the engine has not been told about is accepted - see
     * {@link import("@core/game/audioBus").acceptsAudioBus} for why that is the only workable
     * answer at story-build time, and where a typo gets caught instead.
     * @internal
     */
    static validateVoice(voice: Sound) {
        if (!acceptsAudioBus(voice.config.type, [DefaultAudioBusIds.voice, DefaultAudioBusIds.sound])) {
            throw new StaticScriptWarning(
                `Voice must be a voice, but got ${voice.config.type}. \n`
                + "To prevent unintended behavior and unexpected results, the sound have to be on the voice bus "
                + "(or any bus beneath it). Please use `Sound.voice()` to create the sound."
            );
        }
    }

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
    /** Resolved voice src -> the one `Sound` that plays it. See {@link Scene.getVoice}. */
    private readonly voiceCache: Map<string, Sound> = new Map();
    /**@internal */
    private readonly localPersistent: DynamicPersistent;
    /**@internal */
    private readonly userConfig: Config<ISceneUserConfig, EmptyObject>;
    /**@internal */
    private _futureActions_: LogicAction.Actions[] = [];
    /**
     * Named jump points ({@link Control.label}) declared in this scene, keyed by label name.
     * Built once at construction by {@link constructLabels}; used to resolve {@link Control.jump}.
     * @internal
     */
    private labelMap: Map<string, LogicAction.Actions> = new Map();

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
     * Update the scene background immediately or via transition.
     * @param background - Color or image source to render.
     * @param transition - Optional animation applied while swapping backgrounds.
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *     scene.setBackground("#000", new FadeIn({duration: 1000}))
     * ]);
     * ```
     */
    public setBackground(background: Color | ImageSrc, transition?: ImageTransition): ChainedScene {
        const chain = this.chain();
        return chain.chain(Control.do([this.background.char(background, transition)]));
    }

    /**
     * Jump to another scene and discard the current one.
     *
     * After the jump the calling scene is unloaded and any actions that follow are ignored.
     *
     * A `transition` plays across the whole stage rather than across the background alone; see
     * {@link JumpConfig.transition}.
     * @param scene - The destination scene instance.
     * @param config - Optional transition config (or transition object).
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *     scene.jumpTo(nextScene, new FadeIn({duration: 800}))
     * ]);
     * ```
     */
    public jumpTo(scene: Scene, config: Partial<JumpConfig> | JumpConfig["transition"] = {}): ChainableAction {
        return this.combineActions(new Control({
            allowFutureScene: false,
        }), chain => {
            const defaultJumpConfig: Partial<JumpConfig> = {};
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
                ._transitionToScene(jumpConfig.transition, scene)
                .chain(this._exit());
            return chain;
        })._jumpTo(scene);
    }

    /**
     * Set the scene background music, optionally fading the previous track.
     * @param sound - The BGM or `null` to stop the music.
     * @param fade - Duration of the cross-fade, in milliseconds.
     * @chainable
     * @example
     * ```ts
     * scene.setBackgroundMusic(Sound.bgm("theme.mp3"), 500);
     * ```
     */
    public setBackgroundMusic(sound: Sound | null, fade?: number): ChainedScene {
        return this.chain(new SceneAction<typeof SceneActionTypes["setBackgroundMusic"]>(
            this.chain(),
            SceneActionTypes["setBackgroundMusic"],
            new ContentNode<SceneActionContentType[typeof SceneActionTypes["setBackgroundMusic"]]>().setContent([sound, fade])
        ));
    }

    /**
     * Create an NVL (Novel) mode block for displaying accumulated dialog.
     * In NVL mode, dialogs are stacked on screen rather than replacing each other.
     * @param actions - Actions to execute within NVL mode, or a callback receiving an NVLToken
     * @chainable
     * @example
     * ```ts
     * scene.nvl([
     *     character.say("First line"),
     *     character.say("Second line"),
     *     character.say("Third line"),
     * ]);
     * ```
     * @example
     * ```ts
     * scene.nvl(nvl => [
     *     nvl.show({ duration: 500 }),
     *     character.say("Line 1"),
     *     character.say("Line 2"),
     *     nvl.hide({ duration: 500 }),
     * ]);
     * ```
     */
    public nvl(actions: ActionStatements | ((nvl: NVLToken) => ActionStatements)): ChainableAction;
    public nvl(options: Partial<TransformDefinitions.CommonTransformProps>, actions: ActionStatements | ((nvl: NVLToken) => ActionStatements)): ChainableAction;
    public nvl(
        optionsOrActions: Partial<TransformDefinitions.CommonTransformProps> | ActionStatements | ((nvl: NVLToken) => ActionStatements),
        actionsArg?: ActionStatements | ((nvl: NVLToken) => ActionStatements)
    ): ChainableAction {
        let options: Partial<TransformDefinitions.CommonTransformProps> | undefined;
        let actions: ActionStatements | ((nvl: NVLToken) => ActionStatements);

        if (actionsArg !== undefined) {
            options = optionsOrActions as Partial<TransformDefinitions.CommonTransformProps>;
            actions = actionsArg;
        } else {
            options = undefined;
            actions = optionsOrActions as ActionStatements | ((nvl: NVLToken) => ActionStatements);
        }

        const nvlToken = new NVLToken(this);
        const resolvedActions = typeof actions === "function" ? actions(nvlToken) : actions;
        const flatActions = this.narrativeToActions(resolvedActions);

        const nvlBlockOptions: NvlBlockOptions = {
            showTransition: options,
            hideTransition: options,
        };
        const nvlExitAction = new SceneAction<typeof SceneActionTypes.nvlEnd>(
            this.chain() as any,
            SceneActionTypes.nvlEnd,
            new ContentNode<SceneActionContentType["scene:nvlEnd"]>().setContent([nvlBlockOptions])
        );
        const nvlActions = [...flatActions, nvlExitAction];

        super.constructNodes(nvlActions);

        const nvlBlockAction = new SceneAction<typeof SceneActionTypes.nvlBlock>(
            this.chain() as any,
            SceneActionTypes.nvlBlock,
            new ContentNode<SceneActionContentType["scene:nvlBlock"]>().setContent([
                nvlActions,
                nvlBlockOptions
            ])
        );

        return this.chain(nvlBlockAction);
    }

    /**
     * Register the list of actions (or an action-generating callback) that this scene will execute.
     * @param actions - Either a list of actions or a factory that receives the scene and returns actions.
     * @returns The scene instance, allowing chaining.
     * @example
     * ```ts
     * story.entry(
     *   new Scene("scene-1").action(scene => [
     *     scene.setBackground("#000"),
     *     Control.sleep(1000)
     *   ])
     * );
     * ```
     */
    public action(actions: ActionStatements): this;

    public action(actions: ((scene: Scene) => ActionStatements) | (() => ActionStatements)): this;

    public action(actions: ActionStatements | ((scene: Scene) => ActionStatements) | (() => ActionStatements)): this {
        this.actions = actions;
        return this;
    }

    /**
     * Manually register image URLs so the story knows to preload them.
     * @param src - One or more image URLs to cache ahead of time.
     * @returns The scene so calls can be chained.
     * @example
     * ```ts
     * scene.preloadImage(["bg-night.png", "bg-day.png"]);
     * ```
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

        const images: Image[] = [], texts: Text[] = [], puppets: Puppet[] = [];
        this.getAllChildrenElements(story, userActions, {allowFutureScene: false}).forEach(element => {
            if (Chained.isChained(element)) {
                return;
            }
            if (element instanceof Image) {
                images.push(element);
            } else if (element instanceof Text) {
                texts.push(element);
            } else if (element instanceof Puppet) {
                puppets.push(element);
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
            ...puppets.map(puppet => (puppet as Puppet)._init()),
            ...userActions,
        ];

        const constructed = super.constructNodes(futureActions);
        const sceneRoot = new ContentNode<this>(this.sceneRoot, undefined, constructed || void 0).setContent(this);
        constructed?.setParent(sceneRoot);

        this.sceneRoot?.setContentNode(sceneRoot);
        this._futureActions_ = futureActions;

        this.constructLabels(story);

        return this;
    }

    /**
     * Collect this scene's {@link Control.label} markers and resolve every {@link Control.jump}
     * to its target — both scoped to this scene (`allowFutureScene: false`), so label names are
     * scene-local and a jump can only target a label declared in the same scene.
     *
     * Runs at construction so a duplicate label or an unknown jump target fails the build rather
     * than surfacing mid-play.
     * @internal
     */
    private constructLabels(story: Story): void {
        const actions = this.getAllChildren(story, this.sceneRoot || [], {allowFutureScene: false});

        const labels = new Map<string, LogicAction.Actions>();
        for (const action of actions) {
            if (action instanceof ControlAction && action.type === ControlActionTypes.label) {
                const [name] = action.contentNode.getContent() as [string];
                if (labels.has(name)) {
                    throw new StaticScriptWarning(
                        `Duplicate label "${name}" in scene "${this.config.name}". `
                        + "Label names must be unique within a scene."
                    );
                }
                labels.set(name, action);
            }
        }
        this.labelMap = labels;

        for (const action of actions) {
            if (action instanceof ControlAction && action.type === ControlActionTypes.jump) {
                const [name] = action.contentNode.getContent() as [string];
                const target = labels.get(name);
                if (!target) {
                    throw new StaticScriptWarning(
                        `Jump target label "${name}" not found in scene "${this.config.name}". `
                        + "Control.jump can only jump to a Control.label declared in the same scene."
                    );
                }
                (action as ControlAction<"control:jump">).setJumpTarget(target);
            }
        }
    }

    /**
     * The {@link Control.label} action registered under `name` in this scene, or `null`.
     * @internal
     */
    getLabel(name: string): LogicAction.Actions | null {
        return this.labelMap.get(name) || null;
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
            } else if (action instanceof CharacterAction) {
                // Dialog avatars. Only the static ones can be seen from here - a resolver derives
                // its answer from the portrait's live state, so what it may return is as invisible
                // to this walk as a layer resolver's srcs are. Projects whose avatars are
                // resolver-driven register them with `scene.preloadImage` themselves.
                const sentence = action.type === CharacterActionTypes.say
                    ? action.contentNode.getContent() as Sentence
                    : null;
                for (const avatar of collectStaticAvatarSources(action.callee, sentence)) {
                    this.srcManager.register({type: "image", src: Utils.srcToURL(avatar)});
                }
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
        const usedIds = new Set<string>();

        actions.forEach(action => {
            const staticId = action.getStaticId();
            if (!staticId) {
                return;
            }
            if (usedIds.has(staticId)) {
                throw new StaticScriptWarning(`Duplicate static action id: ${staticId}`);
            }
            usedIds.add(staticId);
        });

        let nextId = 0;
        const nextGeneratedId = () => {
            let id = `a-${nextId++}`;
            while (usedIds.has(id)) {
                id = `a-${nextId++}`;
            }
            usedIds.add(id);
            return id;
        };

        actions.forEach(action => {
            const staticId = action.getStaticId();
            action.resolveId(staticId || nextGeneratedId());
        });
    }

    /**@internal */
    assignElementId(story: Story) {
        const elements = this.getAllChildrenElements(story, this.sceneRoot || []);

        elements.forEach((element, i) => {
            element.resolveId(`e-${i}`);
        });
    }

    /**
     * The `Sound` for a voice id - the SAME `Sound` every time it resolves to the same clip.
     *
     * Identity is the whole point. `AudioManager` keys a playing clip by the `Sound` instance
     * (`getToken` is a `Map.get`), so minting a new one per call made every "is this line's voice
     * still playing?" question answer null against a clip that was audibly playing. Two things
     * depended on that answer and so quietly did nothing: auto-forward's wait for the voice, and
     * `useVoiceState`'s token. It also meant replaying a line layered a second copy over the first
     * instead of restarting it.
     *
     * Keyed by the resolved src rather than by the id, because the take behind an id changes - that
     * is what switching dub language is - and a cache keyed by id would keep handing back the take
     * from the language the player just left.
     *
     * @internal
     */
    getVoice(id: string | number | null): string | Sound | null {
        if (!id) {
            return null;
        }

        const voices = this.config.voices;
        if (voices) {
            if (typeof voices === "function") {
                const voice = voices(id);
                if (typeof voice === "string") {
                    return this.voiceOfSrc(voice);
                }
                Scene.validateVoice(voice);
                return voice;
            }
            const voice = voices[id];
            if (typeof voice === "string") {
                return this.voiceOfSrc(voice);
            }
            return voice || null;
        }
        return null;
    }

    /**@internal */
    private voiceOfSrc(src: string): Sound {
        const cached = this.voiceCache.get(src);
        if (cached) {
            return cached;
        }
        const sound = Sound.voice(src);
        this.voiceCache.set(src, sound);
        return sound;
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
        super.reset();
        this.state.backgroundImage.reset();
        this.state.backgroundMusic?.reset();
        this.state = this.getInitialState();
    }

    /**@internal */
    private getInitialState(): SceneState {
        const userConfig = this.userConfig.get();
        // Beneath the music bus counts: `ambience` under `bgm` is music, and a bus the engine has
        // not been told about is let through (see `acceptsAudioBus`).
        if (userConfig.backgroundMusic
            && !acceptsAudioBus(userConfig.backgroundMusic.config.type, [DefaultAudioBusIds.bgm])) {
            throw new StaticScriptWarning(
                `[Scene: ${this.config.name}] Background music must be a bgm, but got ${userConfig.backgroundMusic.config.type}. \n`
                + "To prevent unintended behavior and unexpected results, the sound have to be on the music bus "
                + "(or any bus beneath it). Please use `Sound.bgm()` to create the sound."
            );
        }

        const backgroundImage = this.state?.backgroundImage
            ? this.state.backgroundImage.reset()
            : (new Image({
                src: userConfig.background,
                opacity: 1,
                autoFit: true,
                name: `[[Background Image of ${this.config.name}]]`,
                layer: this.config.defaultBackgroundLayer,
            })._setIsBackground(true));

        const backgroundMusic = userConfig.backgroundMusic
            ? (this.state?.backgroundMusic ? this.state.backgroundMusic.reset() : userConfig.backgroundMusic)
            : null;

        return {
            backgroundImage,
            backgroundMusic,
        };
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
    private _transitionToScene(transition: Transition | undefined, target: Scene): ChainedScene {
        const chain = this.chain();
        if (!transition) {
            return chain;
        }

        return chain.chain(new SceneAction<typeof SceneActionTypes["transitionToScene"]>(
            chain,
            SceneActionTypes["transitionToScene"],
            new ContentNode<SceneActionContentType[typeof SceneActionTypes["transitionToScene"]]>()
                .setContent([transition, target])
        ));
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
