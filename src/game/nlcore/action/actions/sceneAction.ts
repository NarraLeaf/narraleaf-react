import {SceneActionContentType, SceneActionTypes} from "@core/action/actionTypes";
import type {Scene, SceneDataRaw} from "@core/elements/scene";
import {GameState, PlayerStateElementSnapshot} from "@player/gameState";
import {Awaitable, SkipController} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";
import {RuntimeScriptError} from "@core/common/Utils";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {ImageAction} from "@core/action/actions/imageAction";
import {ActionSearchOptions} from "@core/types";
import {ExposedState, ExposedStateType} from "@player/type";
import { Sound } from "@core/elements/sound";
import { ImageDataRaw } from "@core/elements/displayable/image";
import { ActionExecutionInjection, ExecutedActionResult } from "../action";
import { StackModelRawData } from "../stackModel";

type SceneSnapshot = {
    state: SceneDataRaw | null;
    local: Record<string, any>;
    element: PlayerStateElementSnapshot;
    background: ImageDataRaw | null;
};

export class SceneAction<T extends typeof SceneActionTypes[keyof typeof SceneActionTypes] = typeof SceneActionTypes[keyof typeof SceneActionTypes]>
    extends TypedAction<SceneActionContentType, T, Scene> {
    static ActionTypes = SceneActionTypes;

    static handleSceneInit(scene: Scene, next: CalledActionResult, state: GameState, awaitable: Awaitable<CalledActionResult, any>) {
        if (state.isSceneActive(scene)) {
            return next;
        }

        state
            .registerSrcManager(scene.srcManager)
            .addScene(scene)
            .flush();
        scene.local.init(state.getStorable());

        state.getExposedStateAsync<ExposedStateType.scene>(scene, (exposed) => {
            SceneAction.initBackgroundMusic(scene, exposed);
            awaitable.resolve(next);

            state.logger.debug("Scene Action", "Scene init");
        });

        return awaitable;
    }

    static initBackgroundMusic(scene: Scene, exposed: ExposedState[ExposedStateType.scene]) {
        if (scene.state.backgroundMusic) {
            exposed.setBackgroundMusic(scene.state.backgroundMusic, scene.config.backgroundMusicFade);
        }
    }

    static createSceneSnapshot(scene: Scene, state: GameState): SceneSnapshot {
        const element = state.findElementByScene(scene);
        if (!element) {
            throw new RuntimeScriptError("Scene not found when creating snapshot (scene: " + scene.getId() + ")");
        }
        return {
            state: scene.toData(),
            local: scene.local.getNamespace(state.getStorable()).toData(),
            element: state.createElementSnapshot(element),
            background: scene.background.toData(),
        };
    }

    static restoreSceneSnapshot(snapshot: SceneSnapshot, state: GameState) {
        const scene = snapshot.element.scene;
        const element = state.findElementByScene(scene);
        if (element) {
            state.removeElement(element);
        }

        // Restore the element
        const restoredElement = state.fromElementSnapshot(snapshot.element);
        state.addElement(restoredElement);

        // Restore the local persistent
        scene.local.getNamespace(state.getStorable()).load(snapshot.local);

        // Restore the scene
        if (snapshot.state) {
            scene.fromData(snapshot.state);
        }

        // Restore the background
        if (snapshot.background) {
            scene.background.fromData(snapshot.background);
        }
    }

    applyTransition(gameState: GameState, transition: ImageTransition, injection: ActionExecutionInjection) {
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                gameState.logger.info("Background Transition", "Skipped");
                return super.executeAction(gameState, injection) as CalledActionResult;
            }));
        const exposed = gameState.getExposedStateForce<ExposedStateType.image>(this.callee.background);
        exposed.applyTransition(transition, () => {
            awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
        });
        gameState.timelines.attachTimeline(awaitable);

        return awaitable;
    }

    exit(state: GameState) {
        state
            .offSrcManager(this.callee.srcManager)
            .removeScene(this.callee);
        this.callee.state.backgroundImage.reset();
    }

    public executeAction(gameState: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        if (this.type === SceneActionTypes.action) {
            return super.executeAction(gameState, injection);
        } else if (this.is<SceneAction<"scene:init">>(SceneAction, "scene:init")) {
            const awaitable = new Awaitable<CalledActionResult, any>(v => v);

            const timeline = gameState.timelines.attachTimeline(awaitable);
            gameState.actionHistory.push({
                action: this,
                stackModel: injection.stackModel,
                timeline
            }, () => {
                this.exit(gameState);
            }, []);

            const next = {
                type: this.type,
                node: this.contentNode.getChild()
            };

            return SceneAction.handleSceneInit(this.callee, next, gameState, Awaitable.forward(awaitable, next));
        } else if (this.type === SceneActionTypes.exit) {
            const originalSnapshot = SceneAction.createSceneSnapshot(this.callee, gameState);
            gameState.actionHistory.push<[SceneSnapshot]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevSnapshot) => {
                const awaitable = new Awaitable<CalledActionResult, any>(v => v);
                gameState.timelines.attachTimeline(awaitable);

                SceneAction.handleSceneInit(this.callee, {
                    type: this.type,
                    node: this.contentNode.getChild()
                }, gameState, awaitable);
                SceneAction.restoreSceneSnapshot(prevSnapshot, gameState);
            }, [originalSnapshot]);

            gameState.getStorable()
                .removeNamespace(this.callee.local.getNamespaceName());

            this.exit(gameState);
            return super.executeAction(gameState, injection);
        } else if (this.type === SceneActionTypes.jumpTo) {
            const targetScene = (this.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0];
            const scene = gameState.getStory().getScene(targetScene);
            if (!scene) {
                throw this._sceneNotFoundError(this.getSceneName(targetScene));
            }

            const stackSnapshot = gameState.getLiveGame().getStackModelForce().serialize();
            gameState.actionHistory.push<[StackModelRawData]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevStackSnapshot) => {
                const [actionMaps] = gameState.getLiveGame().constructMaps();

                gameState.getLiveGame().getStackModelForce().deserialize(prevStackSnapshot, actionMaps);
            }, [stackSnapshot]);

            const future = scene.getSceneRoot().contentNode;
            gameState.getLiveGame()
                .clearMainStack()
                .getStackModelForce()
                .push({
                    type: this.type,
                    node: future
                });

            return null;
        } else if (this.type === SceneActionTypes.setBackgroundMusic) {
            const [sound, fade] = (this.contentNode as ContentNode<SceneActionContentType["scene:setBackgroundMusic"]>).getContent();
            const scene = this.callee;
            const exposed = gameState.getExposedStateForce<ExposedStateType.scene>(scene);

            const originalMusic = scene.state.backgroundMusic;
            gameState.actionHistory.push<[Sound | null]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevMusic) => {
                if (prevMusic) exposed.setBackgroundMusic(prevMusic, 0);
            }, [originalMusic]);

            exposed.setBackgroundMusic(sound, fade || 0);
            this.callee.state.backgroundMusic = sound;

            return super.executeAction(gameState, injection);
        } else if (this.type === SceneActionTypes.preUnmount) {
            this.callee.events.emit("event:scene.preUnmount");

            return super.executeAction(gameState, injection);
        } else if (this.type === SceneActionTypes.transitionToScene) {
            const [transition, scene, src] = (this.contentNode as ContentNode<SceneActionContentType["scene:transitionToScene"]>).getContent();

            transition._setPrevSrc(ImageAction.resolveCurrentSrc(this.callee.background));
            if (scene) {
                transition._setTargetSrc(ImageAction.resolveCurrentSrc(scene.background));
            } else if (src) {
                transition._setTargetSrc(src);
            }

            return this.applyTransition(gameState, transition, injection);
        }

        throw new Error("Unknown scene action type: " + this.type);
    }

    getFutureActions(story: Story, searchOptions: ActionSearchOptions = {}): LogicAction.Actions[] {
        if (this.type === SceneActionTypes.jumpTo && searchOptions.allowFutureScene !== false) {
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

    stringify(story: Story, seen: Set<LogicAction.Actions>, _strict: boolean): string {
        if (this.type === SceneActionTypes.jumpTo) {
            if (seen.has(this)) {
                return super.stringifyWithContent("Scene", "[[recursive]]");
            }
            seen.add(this);

            const [targetScene] = (this.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent();;

            return super.stringifyWithContent("Scene", `jumpTo {${targetScene.stringify(story, seen, _strict)}}`);
        }

        return super.stringifyWithName("SceneAction");
    }
}