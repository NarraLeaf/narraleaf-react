import {ContentNode} from "@core/action/tree/actionTree";
import {Awaitable, SkipController} from "@lib/util/data";
import {Image as GameImage, Image} from "@core/elements/image";
import {LogicAction} from "@core/action/logicAction";
import {Action} from "@core/action/action";
import type {Character} from "@core/elements/character";
import type {Scene} from "@core/elements/scene";
import type {Story} from "@core/elements/story";
import type {Script} from "@core/elements/script";
import type {Menu, MenuData} from "@core/elements/menu";
import type {Condition} from "@core/elements/condition";
import type {CalledActionResult} from "@core/gameTypes";
import {GameState} from "@player/gameState";
import type {Sound} from "@core/elements/sound";
import {Control} from "@core/elements/control";
import {
    CharacterActionContentType,
    CharacterActionTypes,
    ConditionActionContentType,
    ConditionActionTypes,
    ControlActionContentType,
    ControlActionTypes,
    ImageActionContentType,
    ImageActionTypes,
    MenuActionContentType,
    MenuActionTypes,
    SceneActionContentType,
    SceneActionTypes,
    ScriptActionContentType,
    ScriptActionTypes,
    SoundActionContentType,
    SoundActionTypes,
    StoryActionContentType,
    StoryActionTypes
} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {Sentence} from "@core/elements/character/sentence";

export class TypedAction<
    ContentType extends Record<string, any> = Record<string, any>,
    T extends keyof ContentType & string = keyof ContentType & string,
    Callee extends LogicAction.GameElement = LogicAction.GameElement
> extends Action<ContentType[T], Callee> {
    declare callee: Callee;

    constructor(callee: Proxied<Callee, Chained<LogicAction.Actions, Callee>>, type: any, contentNode: ContentNode<ContentType[T]>) {
        super(callee, type, contentNode);
        this.callee = callee.getSelf();
        this.contentNode.action = this;
    }

    unknownType() {
        throw new Error("Unknown action type: " + this.type);
    }
}

export class CharacterAction<T extends typeof CharacterActionTypes[keyof typeof CharacterActionTypes] = typeof CharacterActionTypes[keyof typeof CharacterActionTypes]>
    extends TypedAction<CharacterActionContentType, T, Character> {
    static ActionTypes = CharacterActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === CharacterActionTypes.say) {
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => ({
                        type: this.type as any,
                        node: this.contentNode.getChild()
                    })));

            const sentence = (this.contentNode as ContentNode<Sentence>).getContent();
            const voice = sentence.config.voice;

            if (voice) {
                SoundAction.initSound(state, voice);
                const token = state.playSound(voice, () => {
                    voice.$stop();
                });
                voice.$setToken(token);
            }

            state.createText(this.getId(), sentence, () => {
                if (voice && voice.$getHowl()) {
                    voice.$getHowl()!.stop(voice.$getToken());
                    voice.$stop();
                }

                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            });

            return awaitable;
        } else if (this.type === CharacterActionTypes.setName) {
            this.callee.state.name = (this.contentNode as ContentNode<CharacterActionContentType["character:setName"]>).getContent()[0];
            return super.executeAction(state);
        }

        throw super.unknownType();
    }
}

export class SceneAction<T extends typeof SceneActionTypes[keyof typeof SceneActionTypes] = typeof SceneActionTypes[keyof typeof SceneActionTypes]>
    extends TypedAction<SceneActionContentType, T, Scene> {
    static ActionTypes = SceneActionTypes;

    static handleSceneInit(sceneAction: SceneAction, state: GameState, awaitable: Awaitable<CalledActionResult, any>) {
        if (state.isSceneActive(sceneAction.callee)) {
            return {
                type: sceneAction.type,
                node: sceneAction.contentNode.getChild()
            };
        }

        state
            .registerSrcManager(sceneAction.callee.srcManager)
            .addScene(sceneAction.callee);

        SceneAction.registerEventListeners(sceneAction.callee, state, () => {
            awaitable.resolve({
                type: sceneAction.type,
                node: sceneAction.contentNode.getChild()
            });
            state.stage.next();
        });

        return awaitable;
    }

    static registerEventListeners(scene: Scene, state: GameState, onInit?: () => void) {
        scene.events.once("event:scene.unmount", () => {
            state.offSrcManager(scene.srcManager);
        });

        scene.events.once("event:scene.mount", () => {
            if (scene.state.backgroundMusic) {
                SoundAction.initSound(state, scene.state.backgroundMusic);
                scene.events.emit("event:scene.setBackgroundMusic",
                    scene.state.backgroundMusic,
                    scene.config.backgroundMusicFade
                );
            }
        });

        scene.events.once("event:scene.imageLoaded", () => {
            const initTransform = scene.getInitTransform();
            scene.events.any("event:scene.initTransform", initTransform).then(() => {
                if (onInit) {
                    onInit();
                }
            });
        });
    }

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === SceneActionTypes.action) {
            return super.executeAction(state);
        } else if (this.type === SceneActionTypes.setBackground) {
            this.callee.state.background = (this.contentNode as ContentNode<SceneActionContentType["scene:setBackground"]>).getContent()![0];
            return super.executeAction(state);
        } else if (this.type === SceneActionTypes.sleep) {
            const awaitable = new Awaitable<CalledActionResult, any>(v => v);
            const content = (this.contentNode as ContentNode<number | Promise<any> | Awaitable<any, any>>).getContent();
            const wait = new Promise<void>(resolve => {
                if (typeof content === "number") {
                    setTimeout(() => {
                        resolve();
                    }, content);
                } else if (Awaitable.isAwaitable<any, any>(content)) {
                    content.then(resolve);
                } else {
                    content?.then(resolve);
                }
            });
            wait.then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === SceneActionTypes.applyTransition) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>()
                .registerSkipController(new SkipController(() => {
                    state.logger.info("NarraLeaf-React: Background Transition", "Skipped");
                    return {
                        type: this.type,
                        node: this.contentNode.getChild()
                    };
                }));
            const transition = (this.contentNode as ContentNode<SceneActionContentType["scene:applyTransition"]>).getContent()[0];
            this.callee.events.any("event:scene.applyTransition", transition).then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === SceneActionTypes.init) {
            const awaitable = new Awaitable<CalledActionResult, any>(v => v);
            return SceneAction.handleSceneInit(this, state, awaitable);
        } else if (this.type === SceneActionTypes.exit) {
            state
                .offSrcManager(this.callee.srcManager)
                .removeScene(this.callee);

            const awaitable = new Awaitable<CalledActionResult, any>(v => v);
            this.callee.events.once("event:scene.unmount", () => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === SceneActionTypes.jumpTo) {
            const scene = (this.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0];
            const current = this.contentNode;

            const future = scene.sceneRoot?.contentNode || null;
            if (future) current.addChild(future);

            return super.executeAction(state);
        } else if (this.type === SceneActionTypes.setBackgroundMusic) {
            const [sound, fade] = (this.contentNode as ContentNode<SceneActionContentType["scene:setBackgroundMusic"]>).getContent();

            this.callee.events.emit("event:scene.setBackgroundMusic", sound, fade || 0);

            return super.executeAction(state);
        } else if (this.type === SceneActionTypes.preUnmount) {
            this.callee.events.emit("event:scene.preUnmount");
            return super.executeAction(state);
        } else if (this.type === SceneActionTypes.applyTransform) {
            const [transform] = (this.contentNode as ContentNode<SceneActionContentType["scene:applyTransform"]>).getContent();
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                .registerSkipController(new SkipController(() => {
                    return {
                        type: this.type,
                        node: this.contentNode.getChild()
                    };
                }));
            this.callee.events.any("event:scene.applyTransform", transform)
                .then(() => {
                    awaitable.resolve({
                        type: this.type,
                        node: this.contentNode.getChild()
                    });
                    state.stage.next();
                });
            return awaitable;
        }

        throw new Error("Unknown scene action type: " + this.type);
    }

    getFutureActions(): LogicAction.Actions[] {
        if (this.type === SceneActionTypes.jumpTo) {
            // We don't care about the actions after jumpTo
            // because they won't be executed
            const sceneRootNode = (this.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0]?.sceneRoot?.contentNode;
            return sceneRootNode?.action ? [sceneRootNode.action] : [];
        }
        const action = this.contentNode.getChild()?.action;
        return action ? [action] : [];
    }
}

export class StoryAction<T extends typeof StoryActionTypes[keyof typeof StoryActionTypes] = typeof StoryActionTypes[keyof typeof StoryActionTypes]>
    extends TypedAction<StoryActionContentType, T, Story> {
    static ActionTypes = StoryActionTypes;
}

export class ImageAction<T extends typeof ImageActionTypes[keyof typeof ImageActionTypes] = typeof ImageActionTypes[keyof typeof ImageActionTypes]>
    extends TypedAction<ImageActionContentType, T, Image> {
    static ActionTypes = ImageActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === ImageActionTypes.init) {
            const lastScene = state.findElementByImage(this.callee);
            if (lastScene) {
                state.disposeImage(this.callee, lastScene.scene);
            }

            const scene = (this.contentNode as ContentNode<ImageActionContentType["image:init"]>).getContent()[0];
            state.createImage(this.callee, scene);

            const awaitable = new Awaitable<CalledActionResult, any>(v => v);

            this.callee.events.once("event:image.mount", async () => {
                if (!this.callee.getScope()?.current) {
                    await this.callee.events.any(GameImage.EventTypes["event:image.elementLoaded"]);
                }

                await this.callee.events.any("event:image.init");
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === ImageActionTypes.setSrc) {
            this.callee.state.src = (this.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>).getContent()[0];
            state.logger.debug("Image - Set Src", this.callee.state.src);

            state.stage.update();
            return super.executeAction(state);
        } else if ([
            ImageActionTypes.show,
            ImageActionTypes.hide,
            ImageActionTypes.applyTransform
        ].includes(this.type)) {
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => {
                        if (this.type === ImageActionTypes.hide) {
                            this.callee.state.display = false;
                        }
                        return super.executeAction(state) as CalledActionResult;
                    }));
            const transform = (this.contentNode as ContentNode<ImageActionContentType["image:show"]>).getContent()[1];

            if (this.type === ImageActionTypes.show) {
                this.callee.state.display = true;
                state.stage.update();
            }

            state.animateImage(Image.EventTypes["event:image.applyTransform"], this.callee, [
                transform
            ], () => {
                if (this.type === ImageActionTypes.hide) {
                    this.callee.state.display = false;
                }
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode?.getChild(),
                });
            });
            return awaitable;
        } else if (this.type === ImageActionTypes.dispose) {
            state.disposeImage(this.callee);
            this.callee._$setDispose();
            return super.executeAction(state);
        } else if (this.type === ImageActionTypes.applyTransition) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                .registerSkipController(new SkipController(() => {
                    if (this.type === ImageActionTypes.hide) {
                        this.callee.state.display = false;
                    }
                    return {
                        type: this.type,
                        node: this.contentNode.getChild()
                    };
                }));
            const transition = (this.contentNode as ContentNode<ImageActionContentType["image:applyTransition"]>).getContent()[0];
            this.callee.events.any("event:image.applyTransition", transition).then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === ImageActionTypes.flush) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            this.callee.events.any("event:image.flushComponent")
                .then(() => {
                    awaitable.resolve({
                        type: this.type,
                        node: this.contentNode.getChild()
                    });
                    state.stage.next();
                });
            return awaitable;
        }

        throw super.unknownType();
    }
}

export class ConditionAction<T extends typeof ConditionActionTypes[keyof typeof ConditionActionTypes] = typeof ConditionActionTypes[keyof typeof ConditionActionTypes]>
    extends TypedAction<ConditionActionContentType, T, Condition> {
    static ActionTypes = ConditionActionTypes;

    executeAction(gameState: GameState) {
        const nodes = this.callee.evaluate(this.contentNode.getContent(), {
            gameState
        });
        nodes?.[nodes.length - 1]?.contentNode.addChild(this.contentNode.getChild());
        this.contentNode.addChild(nodes?.[0]?.contentNode || null);
        return {
            type: this.type as any,
            node: this.contentNode.getChild(),
        };
    }

    getFutureActions(): LogicAction.Actions[] {
        return [...this.callee._getFutureActions(), ...super.getFutureActions()];
    }
}

export class ScriptAction<T extends typeof ScriptActionTypes[keyof typeof ScriptActionTypes] = typeof ScriptActionTypes[keyof typeof ScriptActionTypes]>
    extends TypedAction<ScriptActionContentType, T, Script> {
    static ActionTypes = ScriptActionTypes;

    public executeAction(gameState: GameState) {
        this.contentNode.getContent().execute({
            gameState,
        });
        return super.executeAction(gameState);
    }
}

export class MenuAction<T extends typeof MenuActionTypes[keyof typeof MenuActionTypes] = typeof MenuActionTypes[keyof typeof MenuActionTypes]>
    extends TypedAction<MenuActionContentType, T, Menu> {
    static ActionTypes = MenuActionTypes;

    public executeAction(state: GameState) {
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
        const menu = this.contentNode.getContent() as MenuData;

        state.createMenu(menu, v => {
            const lastChild = state.game.getLiveGame().getCurrentAction()?.contentNode.getChild() || null;
            if (lastChild) {
                v.action[v.action.length - 1]?.contentNode.addChild(lastChild);
            }
            awaitable.resolve({
                type: this.type as any,
                node: v.action[0].contentNode
            });
        });
        return awaitable;
    }

    getFutureActions() {
        const menu = (this.contentNode as ContentNode<MenuActionContentType["menu:action"]>).getContent();
        return [...this.callee._getFutureActions(menu.choices), ...super.getFutureActions()];
    }
}

export class SoundAction<T extends typeof SoundActionTypes[keyof typeof SoundActionTypes] = typeof SoundActionTypes[keyof typeof SoundActionTypes]>
    extends TypedAction<SoundActionContentType, T, Sound> {
    static ActionTypes = SoundActionTypes;

    static initSound(state: GameState, sound: Sound) {
        if (!sound.$getHowl()) {
            sound.$setHowl(
                new (state.getHowl())(sound.getHowlOptions())
            );
        }
    }

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === SoundActionTypes.play) {
            SoundAction.initSound(state, this.callee);
            if (!this.callee.$getHowl()) {
                throw new Error("Howl is not initialized");
            }
            if (this.callee.config.sync && !this.callee.config.loop) {
                const awaitable = new Awaitable<CalledActionResult, any>(v => v);
                const token = state.playSound(this.callee, () => {
                    this.callee.$stop();
                    awaitable.resolve({
                        type: this.type as any,
                        node: this.contentNode?.getChild()
                    });
                });
                this.callee.$setToken(token);
                return awaitable;
            } else {
                const token = state.playSound(this.callee, () => {
                    this.callee.$stop();
                });
                this.callee.$setToken(token);
                return super.executeAction(state);
            }
        } else if (this.type === SoundActionTypes.stop) {
            if (this.callee.$getHowl()) {
                this.callee.$getHowl()!.stop();
                this.callee.$stop();
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.fade) {
            const [{
                start,
                end,
                duration
            }] = (this.contentNode as ContentNode<SoundActionContentType["sound:fade"]>).getContent();
            if (this.callee.$getHowl()) {
                const startValue = start === undefined ? this.callee.$getHowl()!.volume() : start;
                this.callee.$getHowl()!.fade(startValue, end, duration, this.callee.$getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.setVolume) {
            const [volume] = (this.contentNode as ContentNode<SoundActionContentType["sound:setVolume"]>).getContent();
            if (this.callee.$getHowl()) {
                this.callee.$getHowl()!.volume(volume, this.callee.$getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.setRate) {
            const [rate] = (this.contentNode as ContentNode<SoundActionContentType["sound:setRate"]>).getContent();
            if (this.callee.$getHowl()) {
                this.callee.$getHowl()!.rate(rate, this.callee.$getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.pause) {
            if (this.callee.$getHowl()) {
                this.callee.$getHowl()!.pause(this.callee.$getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.resume) {
            if (this.callee.$getHowl()) {
                this.callee.$getHowl()!.play(this.callee.$getToken());
            }
            return super.executeAction(state);
        }

        throw super.unknownType();
    }
}

export class ControlAction<T extends typeof ControlActionTypes[keyof typeof ControlActionTypes] = typeof ControlActionTypes[keyof typeof ControlActionTypes]>
    extends TypedAction<ControlActionContentType, T, Control> {
    static ActionTypes = ControlActionTypes;

    /**
     * Execute all actions in the content node
     * will wait for awaitable actions to resolve
     */
    public async executeAllActions(state: GameState, action: LogicAction.Actions) {
        const exited = false;
        let current: LogicAction.Actions | null = action;
        while (!exited && current) {
            const next = state.game.getLiveGame().executeAction(state, current);

            state.logger.debug("Control - Next Action", next);

            if (!next) {
                break;
            }
            if (Awaitable.isAwaitable(next)) {
                const {node} = await new Promise<CalledActionResult>((r) => {
                    next.then((_) => r(next.result as any));
                });
                if (node) {
                    current = node.action;
                } else {
                    break;
                }
            } else {
                current = next as LogicAction.Actions;
            }
        }
    }

    public async executeSingleAction(state: GameState, action: LogicAction.Actions) {
        const next = state.game.getLiveGame().executeAction(state, action);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(next)) {
            const {node} = await new Promise<CalledActionResult>((r) => {
                next.then((_) => r(next.result as any));
            });
            return node;
        } else {
            return next;
        }
    }

    public execute(state: GameState, awaitable: Awaitable<any, any>, content: LogicAction.Actions[]) {
        if (content.length > 0) {
            this.executeAllActions(state, content[0])
                .then(() => {
                    awaitable.resolve({
                        type: this.type,
                        node: this.contentNode.getChild()
                    });
                    state.stage.next();
                });
            return awaitable;
        } else {
            return super.executeAction(state);
        }
    }

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> {
        const contentNode = this.contentNode as ContentNode<ControlActionContentType[T]>;
        const [content] = contentNode.getContent() as [LogicAction.Actions[]];
        if (this.type === ControlActionTypes.do) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            return this.execute(state, awaitable, content);
        } else if (this.type === ControlActionTypes.doAsync) {
            (async () => {
                if (content.length > 0) {
                    await this.executeAllActions(state, content[0]);
                }
            })();
            return super.executeAction(state);
        } else if (this.type === ControlActionTypes.any) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            const promises = content.map(action => this.executeSingleAction(state, action));
            Promise.any(promises).then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === ControlActionTypes.all) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            (async () => {
                await Promise.all(content.map(action => this.executeSingleAction(state, action)));
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            })();
            return awaitable;
        } else if (this.type === ControlActionTypes.allAsync) {
            (async () => {
                for (const action of content) {
                    this.executeSingleAction(state, action).then(_ => (void 0));
                }
            })();
            return super.executeAction(state);
        } else if (this.type === ControlActionTypes.repeat) {
            const [actions, times] =
                (this.contentNode as ContentNode<ControlActionContentType["control:repeat"]>).getContent();
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            (async () => {
                for (let i = 0; i < times; i++) {
                    if (actions.length > 0) {
                        await this.executeAllActions(state, actions[0]);
                    }
                }
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            })();
            return awaitable;
        }

        throw new Error("Unknown control action type: " + this.type);
    }

    getFutureActions(): LogicAction.Actions[] {
        const actions = this.contentNode.getContent()[0];
        const childActions = super.getFutureActions();
        return [...actions, ...childActions];
    }
}
