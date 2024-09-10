import {Constructable} from "../action/constructable";
import {Game} from "../game";
import {Awaitable, deepMerge, DeepPartial, EventDispatcher, safeClone} from "@lib/util/data";
import {Background, CommonImage} from "@core/types";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ControlAction, ImageAction, SceneAction, SoundAction} from "@core/action/actions";
import {Transform} from "@core/elements/transform/transform";
import {ITransition} from "@core/elements/transition/type";
import {SrcManager} from "@core/elements/srcManager";
import {Sound, SoundDataRaw} from "@core/elements/sound";
import _ from "lodash";
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
import Actions = LogicAction.Actions;
import ImageTransformProps = TransformDefinitions.ImageTransformProps;

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
    any,
    Actions,
    SceneAction<"scene:action">
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
    }
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
    }
    _sceneRoot?: SceneAction<"scene:action">;
    private _actions: SceneAction<any>[] = [];

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

    public activate(): this {
        return this._init();
    }

    public deactivate(): this {
        return this._exit();
    }

    /**
     * 设置背景图片，如果提供了 {@link transition} 参数，则会应用过渡效果
     * @param background 目标背景
     * @param transition 过渡效果
     */
    public setBackground(background: Background["background"], transition?: ITransition) {
        if (transition) {
            const copy = transition.copy();
            copy.setSrc(Utils.backgroundToSrc(background));
            this.transitionSceneBackground(undefined, copy);
        }
        this._actions.push(new SceneAction(
            this,
            "scene:setBackground",
            new ContentNode<[Background["background"]]>(Game.getIdManager().getStringId()).setContent([
                background,
            ])
        ));
        return this;
    }

    /**
     * 为背景图片应用变换
     * @param transform
     */
    public applyTransform(transform: Transform<ImageTransformProps>) {
        this._actions.push(new SceneAction(
            this,
            "scene:applyTransform",
            new ContentNode(Game.getIdManager().getStringId()).setContent([transform])
        ));
        return this;
    }

    /**
     * 跳转到指定的场景
     * 调用方法后，将无法回到当前调用该跳转的场景上下文，因此该场景会被卸载
     * 任何在跳转操作之后的操作都不会被执行
     */
    public jumpTo(arg0: Scene, config?: JumpConfig): this {
        this._actions.push(new SceneAction(
            this,
            "scene:preUnmount",
            new ContentNode(Game.getIdManager().getStringId()).setContent([])
        ));

        const jumpConfig: Partial<JumpConfig> = config || {};
        this._transitionToScene(arg0, jumpConfig.transition)
            ._exit();
        return this._jumpTo(arg0);
    }

    transitionSceneBackground(scene?: Scene, transition?: ITransition) {
        this._transitionToScene(scene, transition);
        return this;
    }

    /**
     * 等待一段时间，参数可以是毫秒数、Promise、或者一个未解析的{@link Awaitable}
     */
    public sleep(ms: number): this;
    public sleep(promise: Promise<any>): this;
    public sleep(awaitable: Awaitable<any, any>): this;
    public sleep(content: number | Promise<any> | Awaitable<any, any>): this {
        this._actions.push(new SceneAction(
            this,
            "scene:sleep",
            new ContentNode(Game.getIdManager().getStringId()).setContent(content)
        ));
        return this;
    }

    /**
     * 设置背景音乐
     * @param sound 目标音乐
     * @param fade 毫秒数，如果设置，则会将渐出效果应用于上一首音乐，将渐入效果应用于当前音乐，时长为 {@link fade} 毫秒
     */
    public setBackgroundMusic(sound: Sound, fade?: number): this {
        this._actions.push(new SceneAction<typeof SceneActionTypes["setBackgroundMusic"]>(
            this,
            SceneActionTypes["setBackgroundMusic"],
            new ContentNode<SceneActionContentType[typeof SceneActionTypes["setBackgroundMusic"]]>(Game.getIdManager().getStringId()).setContent([sound, fade])
        ));
        return this;
    }

    public toActions(): SceneAction<any>[] {
        let actions = this._actions;
        this._actions = [];
        return actions;
    }

    _$getBackgroundMusic() {
        return this.state.backgroundMusic;
    }

    toData(): SceneDataRaw | null {
        if (_.isEqual(this.state, this.config)) {
            return null;
        }
        return {
            state: {
                ...safeClone(this.state),
                backgroundMusic: this.state.backgroundMusic?.toData(),
                background: this.state.background,
                backgroundImageState: Image.serializeImageState(this.backgroundImageState),
            },
        }
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

    _setTransition(transition: ITransition) {
        this._actions.push(new SceneAction(
            this,
            "scene:setTransition",
            new ContentNode(Game.getIdManager().getStringId()).setContent([transition])
        ));
        return this;
    }

    _applyTransition(transition: ITransition) {
        this._actions.push(new SceneAction(
            this,
            "scene:applyTransition",
            new ContentNode(Game.getIdManager().getStringId()).setContent([transition])
        ));
        return this;
    }

    toTransform(): Transform<ImageTransformProps> {
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
        if (!this.getActions().length) {
            return;
        }

        const seenJump = new Set<SceneAction<typeof SceneActionTypes["jumpTo"]>>();
        const queue: Actions[] = [this.getActions()[0]];
        const futureScene = new Set<Scene>();

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

    public action(actions: (Actions | Actions[])[]): this;

    public action(actions: ((scene: Scene) => Actions[])): this;

    public action(actions: (Actions | Actions[])[] | ((scene: Scene) => Actions[])): this {
        const userActions = Array.isArray(actions) ? actions.flat(2) : actions(this).flat(2);
        const images = this.getAllElements(this.getAllActions(false, userActions))
            .filter(element => element instanceof Image);
        const futureActions = [
            ...this.activate().toActions(),
            ...images.map(image => (image as Image).init().toActions()).flat(2),
            ...userActions,
        ];

        this._sceneRoot = this._action(futureActions);
        return this;
    }

    protected getSceneActions() {
        return this.toActions();
    }

    private _jumpTo(scene: Scene) {
        this._actions.push(new SceneAction(
            this,
            "scene:jumpTo",
            new ContentNode<[Scene]>(Game.getIdManager().getStringId()).setContent([
                scene
            ])
        ));
        return this;
    }

    private _exit(): this {
        this._actions.push(new SceneAction(
            this,
            "scene:exit",
            new ContentNode(Game.getIdManager().getStringId()).setContent([])
        ));
        return this;
    }

    private _transitionToScene(scene?: Scene, transition?: ITransition): this {
        if (transition) {
            const copy = transition.copy();
            if (scene) copy.setSrc(Utils.backgroundToSrc(scene.config.background));
            this._setTransition(copy)
                ._applyTransition(copy);
        }
        if (scene) {
            this._actions.push(
                ...scene.activate().toActions(),
            );
        }
        return this;
    }

    private _init(): this {
        this._actions.push(new SceneAction(
            this,
            "scene:init",
            new ContentNode(Game.getIdManager().getStringId()).setContent([])
        ));
        return this;
    }
}

