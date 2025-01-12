import {SceneActionContentType, SceneActionTypes} from "@core/action/actionTypes";
import type {Scene} from "@core/elements/scene";
import {GameState} from "@player/gameState";
import {Awaitable, SkipController} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";
import {RuntimeScriptError} from "@core/common/Utils";
import {Image} from "@core/elements/displayable/image";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {ImageAction} from "@core/action/actions/imageAction";

export class SceneAction<T extends typeof SceneActionTypes[keyof typeof SceneActionTypes] = typeof SceneActionTypes[keyof typeof SceneActionTypes]>
    extends TypedAction<SceneActionContentType, T, Scene> {
    static ActionTypes = SceneActionTypes;

    static handleSceneInit(sceneAction: SceneAction<typeof SceneActionTypes["init"]>, state: GameState, awaitable: Awaitable<CalledActionResult, any>) {
        const [scene] = sceneAction.contentNode.getContent();
        if (state.isSceneActive(scene)) {
            return {
                type: sceneAction.type,
                node: sceneAction.contentNode.getChild()
            };
        }

        state
            .registerSrcManager(scene.srcManager)
            .addScene(scene)
            .flush();
        scene.local.init(state.game.getLiveGame().getStorable());

        SceneAction.registerEventListeners(scene, state, () => {
            awaitable.resolve({
                type: sceneAction.type,
                node: sceneAction.contentNode.getChild()
            });
            state.stage.next();
        });

        return awaitable;
    }

    static registerEventListeners(scene: Scene, state: GameState, onInit?: () => void) {
        scene.events.once("event:scene.mount", () => {
            if (scene.state.backgroundMusic) {
                scene.events.emit("event:scene.setBackgroundMusic",
                    scene.state.backgroundMusic,
                    scene.config.backgroundMusicFade
                );
            }
            state.logger.debug("Scene Action", "Scene init");
            if (onInit) {
                onInit();
            }
        });
    }

    applyTransition(state: GameState, transition: ImageTransition) {
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Background Transition", "Skipped");
                return super.executeAction(state) as CalledActionResult;
            }));
        this.callee.backgroundImage.events.emit(Image.EventTypes["event:displayable.applyTransition"], transition, () => {
            awaitable.resolve(super.executeAction(state) as CalledActionResult);
            state.stage.next();
        });
        return awaitable;
    }

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === SceneActionTypes.action) {
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
        } else if (this.is<SceneAction<"scene:init">>(SceneAction, "scene:init")) {
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
            const targetScene = (this.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0];
            const current = this.contentNode;
            const scene = state.getStory().getScene(targetScene);
            if (!scene) {
                throw this._sceneNotFoundError(this.getSceneName(targetScene));
            }

            const future = scene.getSceneRoot().contentNode;
            if (future) current.addChild(future);

            return {
                type: this.type,
                node: future
            };
        } else if (this.type === SceneActionTypes.setBackgroundMusic) {
            const [sound, fade] = (this.contentNode as ContentNode<SceneActionContentType["scene:setBackgroundMusic"]>).getContent();

            this.callee.events.emit("event:scene.setBackgroundMusic", sound, fade || 0);

            return super.executeAction(state);
        } else if (this.type === SceneActionTypes.preUnmount) {
            this.callee.events.emit("event:scene.preUnmount");
            state.game
                .getLiveGame()
                .getStorable()
                .removeNamespace(this.callee.local.getNamespaceName());
            return super.executeAction(state);
        } else if (this.type === SceneActionTypes.transitionToScene) {
            const [transition, scene, src] = (this.contentNode as ContentNode<SceneActionContentType["scene:transitionToScene"]>).getContent();

            transition._setPrevSrc(ImageAction.resolveCurrentSrc(this.callee.backgroundImage));
            if (scene) {
                transition._setTargetSrc(ImageAction.resolveCurrentSrc(scene.backgroundImage));
            } else if (src) {
                transition._setTargetSrc(src);
            }

            return this.applyTransition(state, transition);
        }

        throw new Error("Unknown scene action type: " + this.type);
    }

    getFutureActions(story: Story): LogicAction.Actions[] {
        if (this.type === SceneActionTypes.jumpTo) {
            // It doesn't care about the actions after jumpTo
            // because they won't be executed
            const targetScene = (this.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0];
            const scene = story.getScene(targetScene, true);

            if (!scene.isSceneRootConstructed()) {
                scene.constructSceneRoot(story);
            }

            const sceneRootNode = story.getScene(targetScene, true).getSceneRoot()?.contentNode;
            return sceneRootNode?.action ? [sceneRootNode.action] : [];
        }
        const action = this.contentNode.getChild()?.action;
        return action ? [action] : [];
    }

    _sceneNotFoundError(sceneId: string): Error {
        return new RuntimeScriptError(`Scene with name ${sceneId} not found`
            + "\nMake sure you have registered the scene using story.register"
            + `\nAction: (id: ${this.getId()}) ${this.type}`
            + `\nAt: ${this.__stack}`);
    }

    getSceneName(scene: Scene | string): string {
        return typeof scene === "string" ? scene : scene.config.name;
    }
}