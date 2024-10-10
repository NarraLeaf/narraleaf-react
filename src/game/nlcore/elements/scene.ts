import {Constructable} from "../action/constructable";
import {Awaitable, deepMerge, DeepPartial, EventDispatcher, safeClone} from "@lib/util/data";
import {Background} from "@core/types";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ControlAction, ImageAction, SceneAction, SoundAction} from "@core/action/actions";
import {Transform} from "@core/elements/transform/transform";
import {ITransition} from "@core/elements/transition/type";
import {SrcManager} from "@core/elements/srcManager";
import {Sound, SoundDataRaw} from "@core/elements/sound";
import {TransformDefinitions} from "@core/elements/transform/type";
import {CommonPosition, CommonPositionType} from "@core/elements/transform/position";
import {
    ImageActionContentType,
    ImageActionTypes,
    SceneActionContentType,
    SceneActionTypes
} from "@core/action/actionTypes";
import {Image, ImageDataRaw} from "@core/elements/image";
import {Control, Utils} from "@core/common/core";
import {Chained, Proxied} from "@core/action/chain";
import Actions = LogicAction.Actions;
import ImageTransformProps = TransformDefinitions.ImageTransformProps;
import GameElement = LogicAction.GameElement;

export type SceneConfig = {
    invertY: boolean;
    invertX: boolean;
    backgroundMusic: Sound | null;
    backgroundMusicFade: number;
} & Background;
export type SceneState = {
    backgroundMusic?: Sound | null;
};
export type JumpConfig = {
    transition: ITransition;
}

type ChainableAction = Proxied<GameElement, Chained<LogicAction.Actions>> | Actions;
type ChainedScene = Proxied<Scene, Chained<LogicAction.Actions>>;

export type SceneDataRaw = {
    state: {
        backgroundMusic?: SoundDataRaw | null;
        background?: Background["background"];
    };
    backgroundImageState?: ImageDataRaw | null;
}

export type SceneEventTypes = {
    "event:scene.applyTransition": [ITransition | null];
    "event:scene.remove": [];
    "event:scene.load": [],
    "event:scene.unload": [],
    "event:scene.mount": [],
    "event:scene.unmount": [],
    "event:scene.preUnmount": [],
    "event:scene.imageLoaded": [],
    "event:scene.initTransform": [Transform<ImageTransformProps>];
    "event:scene.setBackgroundMusic": [Sound | null, number];
    "event:scene.applyTransform": [Transform<ImageTransformProps>];
};

export class Scene extends Constructable<
    Actions,
    Scene
> {
    static EventTypes: { [K in keyof SceneEventTypes]: K } = {
        "event:scene.applyTransition": "event:scene.applyTransition",
        "event:scene.remove": "event:scene.remove",
        "event:scene.load": "event:scene.load",
        "event:scene.unload": "event:scene.unload",
        "event:scene.mount": "event:scene.mount",
        "event:scene.unmount": "event:scene.unmount",
        "event:scene.preUnmount": "event:scene.preUnmount",
        "event:scene.imageLoaded": "event:scene.imageLoaded",
        "event:scene.initTransform": "event:scene.initTransform",
        "event:scene.setBackgroundMusic": "event:scene.setBackgroundMusic",
        "event:scene.applyTransform": "event:scene.applyTransform",
    };
    static defaultConfig: SceneConfig = {
        background: null,
        invertY: false,
        invertX: false,
        backgroundMusic: null,
        backgroundMusicFade: 0,
    };
    static defaultState: SceneState = {};

    /**@internal */
    readonly name: string;
    /**@internal */
    readonly config: SceneConfig;
    /**@internal */
    readonly srcManager: SrcManager = new SrcManager();
    /**@internal */
    readonly events: EventDispatcher<SceneEventTypes> = new EventDispatcher();
    /**@internal */
    state: SceneConfig & SceneState;
    /**@internal */
    sceneRoot?: SceneAction<"scene:action">;
    /**@internal */
    backgroundImage: Image;

    constructor(name: string, config: DeepPartial<SceneConfig> = Scene.defaultConfig) {
        super();
        this.name = name;
        this.config = deepMerge<SceneConfig>(Scene.defaultConfig, config);
        this.state = deepMerge<SceneConfig & SceneState>(Scene.defaultState, this.config);
        this.backgroundImage = new Image({
            position: new CommonPosition(CommonPositionType.Center),
            opacity: 1,
            src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
        });
    }

    /**
     * Activate the scene
     *
     * This is only used when auto activation is not working
     * @chainable
     */
    public activate(): ChainedScene {
        return this.chain(this._init(this));
    }

    /**
     * Deactivate the scene
     *
     * This is only used when auto deactivation is not working
     * @chainable
     */
    public deactivate(): ChainedScene {
        return this.chain(this._exit());
    }

    /**
     * Set background, if {@link transition} is provided, it will be applied
     * @chainable
     */
    public setBackground(background: Background["background"], transition?: ITransition): ChainedScene {
        return this.combineActions(new Control(), chain => {
            if (transition) {
                const copy = transition.copy();
                copy.setSrc(Utils.backgroundToSrc(background));
                chain._transitionToScene(undefined, copy, background);
            }
            return chain.chain(new SceneAction<"scene:setBackground">(
                chain,
                "scene:setBackground",
                new ContentNode<SceneActionContentType["scene:setBackground"]>().setContent([
                    background,
                ])
            ));
        });
    }

    /**
     * Apply a transform to the scene
     *
     * for example, you can shake the scene by applying a transform with a shake effect
     * @chainable
     */
    public applyTransform(transform: Transform<ImageTransformProps>): ChainedScene {
        return this.chain(new SceneAction(
            this.chain(),
            "scene:applyTransform",
            new ContentNode().setContent([transform])
        ));
    }

    /**
     * Jump to the specified scene
     *
     * After calling the method, you **will not be able to return to the context of the scene** that called the jump, so the scene will be unloaded
     *
     * Any operations after the jump operation will not be executed
     * @chainable
     */
    public jumpTo(arg0: Scene, config?: Partial<JumpConfig>): ChainedScene {
        return this.combineActions(new Control(), chain => {
            const jumpConfig: Partial<JumpConfig> = config || {};
            return chain
                .chain(new SceneAction(
                    chain,
                    "scene:preUnmount",
                    new ContentNode().setContent([])
                ))
                ._transitionToScene(arg0, jumpConfig.transition)
                .chain(arg0._init())
                .chain(this._exit())
                ._jumpTo(arg0);
        });
    }

    /**
     * Wait for a period of time, the parameter can be the number of milliseconds, a Promise, or an unresolved {@link Awaitable}
     * @chainable
     */
    public sleep(ms: number): ChainedScene;

    public sleep(promise: Promise<any>): ChainedScene;

    public sleep(awaitable: Awaitable<any, any>): ChainedScene;

    public sleep(content: number | Promise<any> | Awaitable<any, any>): ChainedScene {
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
            state: {
                ...safeClone(this.state),
                backgroundMusic: this.state.backgroundMusic?.toData(),
                background: this.state.background,
            },
            backgroundImageState: this.backgroundImage.toData(),
        } satisfies SceneDataRaw;
    }

    /**@internal */
    override fromData(data: SceneDataRaw): this {
        this.state = deepMerge<SceneConfig & SceneState>(this.state, data.state);
        if (data.state.backgroundMusic) {
            this.state.backgroundMusic = new Sound().fromData(data.state.backgroundMusic);
            this.state.background = data.state.background;
        }
        if (data.backgroundImageState) {
            this.backgroundImage.fromData(data.backgroundImageState);
        }
        return this;
    }

    /**@internal */
    getInitTransform(): Transform<ImageTransformProps> {
        return new Transform<ImageTransformProps>([
            {
                props: {
                    ...this.backgroundImage.state,
                    opacity: 1,
                },
                options: {
                    duration: 0,
                }
            },
        ]);
    }

    /**
     * Add actions to the scene
     */
    public action(actions: (ChainableAction | ChainableAction[])[]): this;

    public action(actions: ((scene: Scene) => ChainableAction[])): this;

    public action(actions: (ChainableAction | ChainableAction[])[] | ((scene: Scene) => ChainableAction[])): this {
        const userChainedActions: ChainableAction[] = Array.isArray(actions) ? actions.flat(2) : actions(this).flat(2);
        const userActions = userChainedActions.map(v => {
            if (Chained.isChained(v)) {
                return v.fromChained(v as any);
            }
            return v;
        }).flat(2);

        const images = this
            .getAllChildrenElements(userActions)
            .filter(element => (element instanceof Image) && !Chained.isChained(element));
        const futureActions = [
            this._init(this),
            ...images.map(image => (image as Image)._init()),
            ...userActions,
        ];

        const constructed = super.constructNodes(futureActions);
        const sceneRoot = new ContentNode<this>(undefined, undefined, constructed || void 0).setContent(this);
        constructed?.setParent(sceneRoot);

        this.sceneRoot = new SceneAction(
            this.chain(),
            "scene:action",
            sceneRoot
        );

        return this;
    }

    /**@internal */
    registerSrc(seen: Set<Scene> = new Set<Scene>()) {
        if (!this.sceneRoot) {
            return;
        }

        // [0.0.5] - 2024/10/04
        // Without this check, this method will enter cycle and cost a lot of time
        // For example, Control will add some actions to the scene, ths check will not stop correctly
        const seenActions = new Set<Actions>();

        const seenJump = new Set<SceneAction<typeof SceneActionTypes["jumpTo"]>>();
        const queue: Actions[] = [this.sceneRoot];
        const futureScene = new Set<Scene>();

        if (Utils.backgroundToSrc(this.config.background)) {
            this.srcManager.register(new Image({src: Utils.backgroundToSrc(this.config.background)}));
        }

        while (queue.length) {
            const action = queue.shift()!;
            if (seenActions.has(action)) {
                continue;
            }
            seenActions.add(action);

            if (action instanceof SceneAction) {
                if (action.type === SceneActionTypes.jumpTo) {
                    const jumpTo = action as SceneAction<typeof SceneActionTypes["jumpTo"]>;
                    const scene = jumpTo.contentNode.getContent()[0];

                    if (seenJump.has(jumpTo) || seen.has(scene)) {
                        continue;
                    }

                    seenJump.add(jumpTo);
                    futureScene.add(scene);
                    seen.add(scene);
                } else if (action.type === SceneActionTypes.setBackground) {
                    const content = (action.contentNode as ContentNode<SceneActionContentType[typeof SceneActionTypes["setBackground"]]>).getContent()[0];
                    this.srcManager.register(new Image({src: Utils.backgroundToSrc(content)}));
                }
            } else if (action instanceof ImageAction) {
                const imageAction = action as ImageAction;
                this.srcManager.register(imageAction.callee);
                if (action.type === ImageActionTypes.setSrc) {
                    const content = (action.contentNode as ContentNode<ImageActionContentType[typeof ImageActionTypes["setSrc"]]>).getContent()[0];
                    this.srcManager.register(new Image({src: content}));
                }
            } else if (action instanceof SoundAction) {
                this.srcManager.register(action.callee);
            } else if (action instanceof ControlAction) {
                const controlAction = action as ControlAction;
                const actions = controlAction.getFutureActions();

                queue.push(...actions);
            }
            queue.push(...action.getFutureActions());
        }

        futureScene.forEach(scene => {
            scene.registerSrc(seen);
            this.srcManager.registerFuture(scene.srcManager);
        });
    }

    /**
     * @internal STILL IN DEVELOPMENT
     */
    assignActionId() {
        const actions = this.getAllChildren(this.sceneRoot || []);

        actions.forEach((action, i) => {
            action.setId(`action-${i}`);
        });
    }

    /**
     * @internal STILL IN DEVELOPMENT
     */
    assignElementId() {
        const elements = this.getAllChildrenElements(this.sceneRoot || []);

        elements.forEach((element, i) => {
            element.setId(`element-${i}`);
        });
    }

    /**@internal */
    override reset() {
        this.state = deepMerge<SceneConfig & SceneState>(Scene.defaultState, this.config);
        this.backgroundImage.reset();
    }

    /**@internal */
    private _applyTransition(transition: ITransition): ChainedScene {
        return this.chain(new SceneAction<"scene:applyTransition">(
            this.chain(),
            "scene:applyTransition",
            new ContentNode<SceneActionContentType["scene:applyTransition"]>().setContent([transition])
        ));
    }

    /**@internal */
    private _jumpTo(scene: Scene): ChainedScene {
        return this.chain(new SceneAction(
            this.chain(),
            "scene:jumpTo",
            new ContentNode<[Scene]>().setContent([
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
    private _transitionToScene(scene?: Scene, transition?: ITransition, src?: Background["background"]): ChainedScene {
        const chain = this.chain();
        if (transition) {
            const copy = transition.copy();
            if (scene) copy.setSrc(Utils.backgroundToSrc(scene.state.background));
            if (src) copy.setSrc(Utils.backgroundToSrc(src));
            chain._applyTransition(copy);
        }
        return chain;
    }

    /**@internal */
    private _init(target = this): SceneAction<"scene:init"> {
        return new SceneAction(
            target.chain(),
            "scene:init",
            new ContentNode().setContent([])
        );
    }
}

