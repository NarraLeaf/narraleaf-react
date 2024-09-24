import {Constructable} from "../action/constructable";
import {Game} from "../game";
import {Awaitable, deepEqual, deepMerge, DeepPartial, EventDispatcher, safeClone} from "@lib/util/data";
import {Background, CommonImage} from "@core/types";
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
import {Image} from "@core/elements/image";
import {Utils} from "@core/common/core";
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

type ChainableAction = Proxied<GameElement, Chained<LogicAction.Actions>>;
type ChainedScene = Proxied<Scene, Chained<LogicAction.Actions>>;

export type SceneDataRaw = {
    state: {
        backgroundMusic?: SoundDataRaw | null;
        background?: Background["background"];
        backgroundImageState?: Partial<CommonImage>;
    };
}

export type SceneEventTypes = {
    "event:scene.setTransition": [ITransition | null];
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
    Actions
> {
    static EventTypes: { [K in keyof SceneEventTypes]: K } = {
        "event:scene.setTransition": "event:scene.setTransition",
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
    static targetAction = SceneAction;
    readonly id: string;
    readonly name: string;
    readonly config: SceneConfig;
    state: SceneConfig & SceneState;
    srcManager: SrcManager = new SrcManager();
    events: EventDispatcher<SceneEventTypes> = new EventDispatcher();
    backgroundImageState: Partial<CommonImage>;
    _liveState = {
        active: false,
    };
    sceneRoot?: SceneAction<"scene:action">;

    constructor(name: string, config: DeepPartial<SceneConfig> = Scene.defaultConfig) {
        super();
        this.id = Game.getIdManager().getStringId();
        this.name = name;
        this.config = deepMerge<SceneConfig>(Scene.defaultConfig, config);
        this.state = deepMerge<SceneConfig & SceneState>(Scene.defaultState, this.config);
        this.backgroundImageState = {
            position: new CommonPosition(CommonPositionType.Center),
        };
    }

    public activate(): ChainedScene {
        return this.chain(this._init(this));
    }

    public deactivate(): ChainedScene {
        return this.chain(this._exit());
    }

    /**
     * Set background, if {@link transition} is provided, it will be applied
     */
    public setBackground(background: Background["background"], transition?: ITransition): ChainedScene {
        if (transition) {
            const copy = transition.copy();
            copy.setSrc(Utils.backgroundToSrc(background));
            this.transitionSceneBackground(undefined, copy);
        }
        return this.chain(new SceneAction(
            this,
            "scene:setBackground",
            new ContentNode<[Background["background"]]>(Game.getIdManager().getStringId()).setContent([
                background,
            ])
        ));
    }

    /**
     * Apply a transform to the scene
     *
     * for example, you can shake the scene by applying a transform with a shake effect
     */
    public applyTransform(transform: Transform<ImageTransformProps>): ChainedScene {
        return this.chain(new SceneAction(
            this,
            "scene:applyTransform",
            new ContentNode(Game.getIdManager().getStringId()).setContent([transform])
        ));
    }

    /**
     * Jump to the specified scene
     *
     * After calling the method, you **will not be able to return to the context of the scene** that called the jump, so the scene will be unloaded
     *
     * Any operations after the jump operation will not be executed
     */
    public jumpTo(arg0: Scene, config?: Partial<JumpConfig>): ChainedScene {
        this.chain(new SceneAction(
            this,
            "scene:preUnmount",
            new ContentNode(Game.getIdManager().getStringId()).setContent([])
        ));

        const jumpConfig: Partial<JumpConfig> = config || {};
        return this._transitionToScene(arg0, jumpConfig.transition)
            .chain(this._exit())
            ._jumpTo(arg0);
    }

    transitionSceneBackground(scene?: Scene, transition?: ITransition): ChainedScene {
        return this._transitionToScene(scene, transition);
    }

    /**
     * Wait for a period of time, the parameter can be the number of milliseconds, a Promise, or an unresolved {@link Awaitable}
     */
    public sleep(ms: number): ChainedScene;
    public sleep(promise: Promise<any>): ChainedScene;
    public sleep(awaitable: Awaitable<any, any>): ChainedScene;
    public sleep(content: number | Promise<any> | Awaitable<any, any>): ChainedScene {
        return this.chain(new SceneAction(
            this,
            "scene:sleep",
            new ContentNode(Game.getIdManager().getStringId()).setContent(content)
        ));
    }

    /**
     * Set background music
     * @param sound Target music
     * @param fade If set, the fade-out effect will be applied to the previous music, and the fade-in effect will be applied to the current music, with a duration of {@link fade} milliseconds
     */
    public setBackgroundMusic(sound: Sound, fade?: number): ChainedScene {
        return this.chain(new SceneAction<typeof SceneActionTypes["setBackgroundMusic"]>(
            this,
            SceneActionTypes["setBackgroundMusic"],
            new ContentNode<SceneActionContentType[typeof SceneActionTypes["setBackgroundMusic"]]>(Game.getIdManager().getStringId()).setContent([sound, fade])
        ));
    }

    _$getBackgroundMusic() {
        return this.state.backgroundMusic;
    }

    toData(): SceneDataRaw | null {
        if (deepEqual(this.state, this.config)) {
            return null;
        }
        return {
            state: {
                ...safeClone(this.state),
                backgroundMusic: this.state.backgroundMusic?.toData(),
                background: this.state.background,
                backgroundImageState: Image.serializeImageState(this.backgroundImageState),
            },
        };
    }

    fromData(data: SceneDataRaw): this {
        this.state = deepMerge<SceneConfig & SceneState>(this.state, data.state);
        if (data.state.backgroundMusic) {
            this.state.backgroundMusic = new Sound().fromData(data.state.backgroundMusic);
            this.state.background = data.state.background;
        }
        if (data.state.backgroundImageState) {
            this.backgroundImageState = Image.deserializeImageState(data.state.backgroundImageState);
        }
        return this;
    }

    _setTransition(transition: ITransition): ChainedScene {
        return this.chain(new SceneAction(
            this,
            "scene:setTransition",
            new ContentNode(Game.getIdManager().getStringId()).setContent([transition])
        ));
    }

    _applyTransition(transition: ITransition): ChainedScene {
        return this.chain(new SceneAction(
            this,
            "scene:applyTransition",
            new ContentNode(Game.getIdManager().getStringId()).setContent([transition])
        ));
    }

    _toTransform(): Transform<ImageTransformProps> {
        return new Transform<ImageTransformProps>([
            {
                props: this.backgroundImageState,
                options: {
                    duration: 0,
                }
            },
        ]);
    }

    registerSrc(seen: Set<Scene> = new Set<Scene>()) {
        if (!this.sceneRoot) {
            return;
        }

        const seenJump = new Set<SceneAction<typeof SceneActionTypes["jumpTo"]>>();
        const queue: Actions[] = [this.sceneRoot];
        const futureScene = new Set<Scene>();

        if (Utils.backgroundToSrc(this.config.background)) {
            this.srcManager.register(new Image({src: Utils.backgroundToSrc(this.config.background)}));
        }

        while (queue.length) {
            const action = queue.shift()!;
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

    public action(actions: (ChainableAction | ChainableAction[])[]): this;

    public action(actions: ((scene: Scene) => ChainableAction[])): this;

    public action(actions: (ChainableAction | ChainableAction[])[] | ((scene: Scene) => ChainableAction[])): this {
        const userChainedActions: ChainableAction[] = Array.isArray(actions) ? actions.flat(2) : actions(this).flat(2);
        const userActions = userChainedActions.map(v => v.fromChained(v as any)).flat(2);
        const images = this.getAllElements(this.getAllActions(false, userActions))
            .filter(element => element instanceof Image);
        const futureActions = [
            this._init(this),
            ...images.map(image => (image as Image).init().getActions()).flat(2),
            ...userActions,
        ];

        const constructed = super.construct(futureActions);
        const sceneRoot = new ContentNode<this>(Game.getIdManager().getStringId(),
            undefined,
            undefined,
            constructed || void 0
        ).setContent(this);
        constructed?.setParent(sceneRoot);

        this.sceneRoot = new SceneAction(
            this,
            "scene:action",
            sceneRoot
        );

        return this;
    }

    private _jumpTo(scene: Scene): ChainedScene {
        return this.chain(new SceneAction(
            this,
            "scene:jumpTo",
            new ContentNode<[Scene]>(Game.getIdManager().getStringId()).setContent([
                scene
            ])
        ));
    }

    private _exit(): SceneAction<"scene:exit"> {
        return new SceneAction(
            this,
            "scene:exit",
            new ContentNode(Game.getIdManager().getStringId()).setContent([])
        );
    }

    private _transitionToScene(scene?: Scene, transition?: ITransition): ChainedScene {
        if (transition) {
            const copy = transition.copy();
            if (scene) copy.setSrc(Utils.backgroundToSrc(scene.config.background));
            this._setTransition(copy)
                ._applyTransition(copy);
        }
        if (scene) {
            this.chain(new SceneAction(
                scene,
                "scene:init",
                new ContentNode(Game.getIdManager().getStringId()).setContent([])
            ));
        }
        return this.chain();
    }

    private _init(target = this): SceneAction<"scene:init"> {
        return new SceneAction(
            target,
            "scene:init",
            new ContentNode(Game.getIdManager().getStringId()).setContent([])
        );
    }
}

