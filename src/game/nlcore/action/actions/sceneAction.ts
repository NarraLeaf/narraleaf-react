import {SceneActionContentType, SceneActionTypes} from "@core/action/actionTypes";
import type {Scene} from "@core/elements/scene";
import {GameState} from "@player/gameState";
import {Awaitable, SkipController} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {TypedAction} from "@core/action/actions";
import {SoundAction} from "@core/action/actions/soundAction";

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

        scene.events.any("event:displayable.init").then(() => {
            if (onInit) {
                onInit();
            }
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
            this.callee.events.any("event:displayable.applyTransition", transition).then(() => {
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
            this.callee.events.any("event:displayable.applyTransform", transform)
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