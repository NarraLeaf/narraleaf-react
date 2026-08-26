import {SceneActionContentType, SceneActionTypes} from "@core/action/actionTypes";
import type {Scene, SceneDataRaw} from "@core/elements/scene";
import {GameState, PlayerStateElementSnapshot, NvlState} from "@player/gameState";
import {Awaitable, SkipController} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";
import {RuntimeInternalError, RuntimeScriptError} from "@core/common/Utils";
import type {Transition} from "@core/elements/transition/transition";
import {ActionSearchOptions} from "@core/types";
import {ExposedState, ExposedStateType} from "@player/type";
import type { TransformDefinitions } from "@core/elements/transform/type";
import { Sound } from "@core/elements/sound";
import { ImageDataRaw } from "@core/elements/displayable/image";
import { ActionExecutionInjection, ExecutedActionResult } from "../action";
import { StackModelRawData } from "../stackModel";

export type SceneSnapshot = {
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

        state.getExposedStateAsync<ExposedStateType.scene>(scene, async (exposed) => {
            await SceneAction.initBackgroundMusic(scene, exposed, state);
            awaitable.resolve(next);

            state.logger.debug("Scene Action", "Scene init");
        });

        return awaitable;
    }

    /**
     * Initialize background music for the target scene.
     * Waits until the previous BGM has completely faded out (if any) before
     * resolving, ensuring seamless audio transition when jumping between scenes.
     *
     * A **suspended** scene starts nothing. This is the one place every path that starts a scene's
     * music passes through, and it has to be the guard, because the call that reaches it is not
     * always the one that asked: `getExposedStateAsync` waits on a component that is not mounted
     * yet, and a stage remount - which is what loading a save performs - fires those waiting
     * callbacks all over again. A caller parked behind a scene call therefore came back from a save
     * with its music playing over the scene it had called.
     */
    static async initBackgroundMusic(
        scene: Scene,
        exposed: ExposedState[ExposedStateType.scene],
        state?: GameState,
    ): Promise<void> {
        if (state?.isSceneSuspended(scene)) {
            return;
        }
        if (!scene.state.backgroundMusic) {
            return;
        }
        // `setBackgroundMusic` already handles fade-out of the previous track and
        // fade-in of the new track. We simply await it so that the caller can
        // chain subsequent actions after the transition finishes.
        await exposed.setBackgroundMusic(scene.state.backgroundMusic, scene.config.backgroundMusicFade);
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

        // ...including whether it was parked behind a call. The element is rebuilt from the
        // snapshot, so a flag set on the old one is gone unless it is put back - and this restore
        // is what every step back in place goes through, one scene at a time, for every scene on
        // the stage (see `GameState.restorePresentationSnapshot`). Without this a single step back
        // onto a line inside a called scene left every caller in the chain unparked: still mounted,
        // still painted, and once again the scene the next line of dialogue attached to.
        //
        // Through `setSceneSuspended` rather than the flag alone, because the pose that goes with
        // it is written imperatively by the stage transition manager and has to agree.
        state.setSceneSuspended(scene, snapshot.element.suspended === true);

        // Restore the local persistent
        scene.local.getNamespace(state.getStorable()).load(snapshot.local);

        // Restore the scene. The element table goes with it for the same reason it does on a load:
        // a scene's background music is a pointer to another element, and an id is the only thing a
        // snapshot can carry it as.
        if (snapshot.state) {
            const [, elementMaps] = state.getLiveGame().constructMaps();
            scene.fromData(snapshot.state, elementMaps);
        }

        // Restore the background
        if (snapshot.background) {
            scene.background.fromData(snapshot.background);
        }
    }

    /**
     * Play `transition` across the whole stage while jumping from this scene to `target`.
     *
     * Both scenes are mounted at this point — `scene:init` added the incoming one and
     * `scene:exit` has not yet removed this one — so the transition drives the two live scene
     * subtrees rather than swapping one image's source underneath them.
     */
    applyStageTransition(
        gameState: GameState,
        transition: Transition,
        target: Scene,
        injection: ActionExecutionInjection,
    ) {
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                gameState.logger.info("Stage Transition", "Skipped");
                return super.executeAction(gameState, injection) as CalledActionResult;
            }));
        const resolveAction = () => {
            if (awaitable.isSettled()) {
                return;
            }
            awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
        };
        const task = gameState.stageTransition.apply(transition, {
            from: this.callee,
            to: target,
        }, resolveAction);
        const timeline = gameState.timelines
            .attachTimeline(awaitable)
            .attachChild(task);
        task.onCancelled(resolveAction);

        gameState.actionHistory.push({
            action: this,
            stackModel: injection.stackModel,
            timeline,
        }, () => {
            if (!awaitable.isSettled()) {
                awaitable.abort();
            }
            task.abort();
        });

        return awaitable;
    }

    /**
     * Take a scene off the stage: the same three steps `scene:exit` performs, for the two paths
     * that unload a scene the exit action never runs for - a call returning, and a plain jump
     * giving up the callers parked behind it.
     */
    static unloadScene(scene: Scene, state: GameState) {
        state.getStorable().removeNamespace(scene.local.getNamespaceName());
        state
            .offSrcManager(scene.srcManager)
            .removeScene(scene);
        scene.state.backgroundImage.reset();
    }

    /**
     * Give up every scene parked by a returnable jump, innermost first.
     *
     * A plain jump clears the execution stack, and the frames it clears are the only things that
     * could ever have returned to those scenes. Leaving them mounted would leave the stage carrying
     * scenes no player can reach, each still holding its layers and its local variables.
     *
     * The snapshots come back so the jump can put them all back if it is undone - the same
     * bargain `scene:exit` strikes with its own single scene.
     */
    static unwindCallStack(state: GameState): [scene: Scene, snapshot: SceneSnapshot][] {
        const suspended = state.getSuspendedScenes();
        const unwound: [Scene, SceneSnapshot][] = suspended.map(scene =>
            [scene, SceneAction.createSceneSnapshot(scene, state)] as [Scene, SceneSnapshot]);

        suspended.forEach(scene => {
            scene.events.emit("event:scene.preUnmount");
            SceneAction.unloadScene(scene, state);
        });
        return unwound;
    }

    /** Put back what {@link SceneAction.unwindCallStack} took away, in the order it took it. */
    static rewindCallStack(unwound: [scene: Scene, snapshot: SceneSnapshot][], state: GameState) {
        unwound.forEach(([scene, snapshot]) => {
            const awaitable = new Awaitable<CalledActionResult, any>(v => v);
            state.timelines.attachTimeline(awaitable);
            SceneAction.handleSceneInit(scene, {type: SceneActionTypes.callTo, node: null}, state, awaitable);
            SceneAction.restoreSceneSnapshot(snapshot, state);
            state.setSceneSuspended(scene, true);
        });
    }

    exit(state: GameState) {
        state
            .offSrcManager(this.callee.srcManager)
            .removeScene(this.callee);
        this.callee.state.backgroundImage.reset();
    }

    /**
     * Give up the call this return address stands for.
     *
     * Reached when the stack holding a `scene:resume` is thrown away rather than run to it - a
     * `Control.any` branch that lost, today. The stage half of `scene:resume` and nothing else: the
     * scene the call entered leaves, and the scene the call had suspended is running again. What is
     * deliberately missing is the rest of it - a return address nobody is coming back to has no
     * next action, and no history entry either, because the branch it was on is not a place a step
     * back can land.
     *
     * Every other scene action holds nothing once it is off the stack, so this is the only override.
     */
    public override abandon(state: GameState): void {
        if (this.type !== SceneActionTypes.resume) {
            return;
        }
        const calledScene = (this.contentNode as ContentNode<SceneActionContentType["scene:resume"]>).getContent()[0];
        const caller = this.callee;
        const music = caller.state.backgroundMusic;

        if (state.isSceneActive(calledScene)) {
            // The event is what stops the called scene's music, exactly as it does when the call
            // returns the ordinary way.
            calledScene.events.emit("event:scene.preUnmount");
            SceneAction.unloadScene(calledScene, state);
        }

        state.setSceneSuspended(caller, false);
        if (music && state.audioManager.isManaged(music)) {
            state.audioManager.resume(music, caller.config.backgroundMusicFade);
        }
    }

    applyNvlVisibility(
        gameState: GameState,
        visible: boolean,
        options: Partial<TransformDefinitions.CommonTransformProps> | undefined,
        injection: ActionExecutionInjection,
    ): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> {
        gameState.setNvlVisibility(visible, options);

        const duration = Math.max(0, options?.duration || 0);
        if (duration === 0) {
            return super.executeAction(gameState, injection) as CalledActionResult;
        }

        const next = super.executeAction(gameState, injection) as CalledActionResult;
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
        let timer: NodeJS.Timeout | null = null;

        awaitable.registerSkipController(new SkipController(() => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            return next;
        }));

        timer = gameState.setTimeout(() => {
            timer = null;
            awaitable.resolve(next);
        }, duration);
        return awaitable;
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
                // The full unload rather than `exit`: putting the scene on the stage also opened its
                // local namespace (`handleSceneInit` calls `local.init`), and stepping back over
                // that has to close it again. `exit` alone left the namespace behind, so a game
                // stepped back to before a scene was entered still carried that scene's locals -
                // and a save written there was not the save the same line would have written on the
                // way through.
                SceneAction.unloadScene(this.callee, gameState);
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
            const unwound = SceneAction.unwindCallStack(gameState);
            gameState.actionHistory.push<[StackModelRawData, [Scene, SceneSnapshot][]]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevStackSnapshot, prevUnwound) => {
                SceneAction.rewindCallStack(prevUnwound, gameState);

                const [actionMaps] = gameState.getLiveGame().constructMaps();

                gameState.getLiveGame().getStackModelForce().deserialize(prevStackSnapshot, actionMaps);
            }, [stackSnapshot, unwound]);

            const future = scene.getSceneRoot().contentNode;
            gameState.getLiveGame()
                .clearMainStack()
                .getStackModelForce()
                .push({
                    type: this.type,
                    node: future
                });

            return null;
        } else if (this.type === SceneActionTypes.preSuspend) {
            // The suspending half of `scene:preUnmount`, in the same place in the order: the music
            // of the scene being left goes quiet before the scene being entered starts its own, so
            // the two cross-fade rather than overlap. Paused rather than stopped, because this
            // scene is coming back and is expected to pick its track up where it left it.
            //
            // It is also where a call that cannot happen is refused, and that is why the refusals
            // are here rather than in `scene:callTo`: by the time the call itself runs, the target
            // scene has already been mounted by the `scene:init` between the two, so asking then
            // whether it is on stage would always answer yes. Nothing has happened yet at this
            // point, so a throw here leaves the stage exactly as the story left it.
            const target = (this.contentNode as ContentNode<SceneActionContentType["scene:preSuspend"]>).getContent()[0];
            const targetScene = gameState.getStory().getScene(target);
            if (!targetScene) {
                throw this._sceneNotFoundError(this.getSceneName(target));
            }

            // One `Scene` owns one place on the stage, one set of layers and one local namespace,
            // so it cannot be in two places on the call stack at once. This is what makes a
            // recursive call (A calls B calls A) impossible rather than merely deep, and saying so
            // here is the only way an author finds out: `addScene` would quietly do nothing and the
            // second copy would drive the stage of the first.
            if (gameState.isSceneActive(targetScene)) {
                throw new RuntimeScriptError(
                    `Cannot call scene ${this.getSceneName(target)}: it is already on stage.`
                    + "\nA returnable jump suspends the scene it leaves rather than unloading it, so a scene"
                    + " cannot be called from itself or from anything it has called.",
                    this
                );
            }

            // One `Scene` is one place on the stage, and a scene parked behind a call is already
            // using it. Two calls open from the same scene at once - which is what a concurrent
            // group asks for when both of its branches take a returnable jump - would each expect
            // to be the one that un-parks it, and the first of them to return hands the stage back
            // while the other call is still running. Nothing downstream can tell those apart, so
            // the story goes quietly wrong: `Control.all` waits for a branch that can no longer
            // finish, and `Control.any` settles on the other branch and hides it.
            if (gameState.isSceneSuspended(this.callee)) {
                throw this._callerAlreadyParkedError(target);
            }

            const depth = gameState.getSuspendedScenes().length;
            const limit = gameState.game.config.maxSceneCallDepth;
            if (depth >= limit) {
                throw new RuntimeScriptError(
                    `Scene call depth limit reached (${limit}).`
                    + "\nEach returnable jump keeps the scene it left mounted, so a chain of them holds every"
                    + " scene in the chain on the stage at once. Raise maxSceneCallDepth if the story really"
                    + " needs to go this deep.",
                    this
                );
            }

            const music = this.callee.state.backgroundMusic;

            gameState.actionHistory.push({
                action: this,
                stackModel: injection.stackModel
            }, () => {
                if (music && gameState.audioManager.isManaged(music)) {
                    gameState.audioManager.resume(music, 0);
                }
            }, []);

            if (music && gameState.audioManager.isManaged(music)) {
                gameState.audioManager.pause(music, this.callee.config.backgroundMusicFade);
            }

            return super.executeAction(gameState, injection);
        } else if (this.type === SceneActionTypes.callTo) {
            const targetScene = (this.contentNode as ContentNode<SceneActionContentType["scene:callTo"]>).getContent()[0];
            const scene = gameState.getStory().getScene(targetScene);
            if (!scene) {
                throw this._sceneNotFoundError(this.getSceneName(targetScene));
            }

            const resumeNode = this.contentNode.getChild();
            if (!resumeNode?.action) {
                throw new RuntimeInternalError(
                    "A scene call has no return address. `scene:callTo` is only ever built with a "
                    + "`scene:resume` chained behind it (see Scene._callScene)."
                );
            }

            const caller = this.callee;
            // Checked again here, and not only in `scene:preSuspend`: two branches of a concurrent
            // group run far enough into the entrance to pass that check before either of them
            // parks anything, so this is the point at which the second call becomes impossible.
            if (gameState.isSceneSuspended(caller)) {
                throw this._callerAlreadyParkedError(targetScene);
            }

            const stackSnapshot = gameState.getLiveGame().getStackModelForce().serialize();
            gameState.actionHistory.push<[StackModelRawData]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevStackSnapshot) => {
                gameState.setSceneSuspended(caller, false);

                const [actionMaps] = gameState.getLiveGame().constructMaps();

                gameState.getLiveGame().getStackModelForce().deserialize(prevStackSnapshot, actionMaps);
            }, [stackSnapshot]);

            // Parked here rather than in `scene:preSuspend`, which runs before the target scene is
            // even mounted: a transition, if the author asked for one, is still to play, and both
            // of its halves are painted from the scene roots. This is the first moment at which the
            // calling scene is genuinely done being looked at.
            gameState.setSceneSuspended(caller, true);

            // The return address goes on FIRST so it ends up underneath: the called scene runs to
            // the end of its own actions, its last one pushes nothing, and the stack falls through
            // to `scene:resume`. That is the whole return mechanism - the same shape `Control.do`
            // uses to run a body and carry on afterwards - and it asks nothing of the save format
            // that was not already there, because both items name a real action by id.
            const future = scene.getSceneRoot().contentNode;
            return [
                {
                    type: this.type,
                    node: resumeNode,
                },
                {
                    type: this.type,
                    node: future,
                },
            ];
        } else if (this.type === SceneActionTypes.resume) {
            const calledScene = (this.contentNode as ContentNode<SceneActionContentType["scene:resume"]>).getContent()[0];
            const caller = this.callee;
            const music = caller.state.backgroundMusic;
            const calledSnapshot = SceneAction.createSceneSnapshot(calledScene, gameState);

            gameState.actionHistory.push<[SceneSnapshot]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevSnapshot) => {
                const awaitable = new Awaitable<CalledActionResult, any>(v => v);
                gameState.timelines.attachTimeline(awaitable);

                SceneAction.handleSceneInit(calledScene, {
                    type: this.type,
                    node: this.contentNode.getChild()
                }, gameState, awaitable);
                SceneAction.restoreSceneSnapshot(prevSnapshot, gameState);

                gameState.setSceneSuspended(caller, true);
                if (music && gameState.audioManager.isManaged(music)) {
                    gameState.audioManager.pause(music, 0);
                }
            }, [calledSnapshot]);

            // The called scene leaves the way any scene leaves: the event is what stops its music,
            // exactly as it does for a scene a plain jump is about to unload.
            calledScene.events.emit("event:scene.preUnmount");
            SceneAction.unloadScene(calledScene, gameState);

            gameState.setSceneSuspended(caller, false);
            if (music && gameState.audioManager.isManaged(music)) {
                gameState.audioManager.resume(music, caller.config.backgroundMusicFade);
            }

            return super.executeAction(gameState, injection);
        } else if (this.type === SceneActionTypes.setBackgroundMusic) {
            const [sound, fade] = (this.contentNode as ContentNode<SceneActionContentType["scene:setBackgroundMusic"]>).getContent();
            const scene = this.callee;
            const exposed = gameState.getExposedStateForce<ExposedStateType.scene>(scene);

            const originalMusic = scene.state.backgroundMusic;
            gameState.actionHistory.push<[Sound | null]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevMusic) => {
                exposed.setBackgroundMusic(prevMusic, 0);
            }, [originalMusic]);

            exposed.setBackgroundMusic(sound, fade || 0);

            return super.executeAction(gameState, injection);
        } else if (this.type === SceneActionTypes.preUnmount) {
            this.callee.events.emit("event:scene.preUnmount");

            return super.executeAction(gameState, injection);
        } else if (this.type === SceneActionTypes.transitionToScene) {
            const [transition, scene] = (this.contentNode as ContentNode<SceneActionContentType["scene:transitionToScene"]>).getContent();

            return this.applyStageTransition(gameState, transition, scene, injection);
        } else if (this.type === SceneActionTypes.nvlBlock) {
            const [actions, options] = (this.contentNode as ContentNode<SceneActionContentType["scene:nvlBlock"]>).getContent();
            
            const preNvlSnapshot = gameState.createNvlSnapshot();
            gameState.enterNvlMode(options);
            gameState.actionHistory.push<[NvlState]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevSnapshot) => {
                gameState.restoreNvlSnapshot(prevSnapshot);
            }, [preNvlSnapshot]);

            if (actions.length === 0) {
                return {
                    type: this.type,
                    node: this.contentNode.getChild(),
                };
            }

            return [
                {
                    type: this.type,
                    node: this.contentNode.getChild(),
                },
                {
                    type: this.type,
                    node: actions[0].contentNode,
                }
            ];
        } else if (this.type === SceneActionTypes.nvlShow) {
            const [options] = (this.contentNode as ContentNode<SceneActionContentType["scene:nvlShow"]>).getContent();
            const previousVisible = gameState.getNvlState().visible;
            const result = this.applyNvlVisibility(gameState, true, options, injection);
            const timeline = Awaitable.isAwaitable(result) ? gameState.timelines.attachTimeline(result) : undefined;
            gameState.actionHistory.push<[boolean]>({
                action: this,
                stackModel: injection.stackModel,
                timeline,
            }, (prevVisible) => {
                gameState.setNvlVisibility(prevVisible);
            }, [previousVisible]);

            return result;
        } else if (this.type === SceneActionTypes.nvlHide) {
            const [options] = (this.contentNode as ContentNode<SceneActionContentType["scene:nvlHide"]>).getContent();
            const previousVisible = gameState.getNvlState().visible;
            const result = this.applyNvlVisibility(gameState, false, options, injection);
            const timeline = Awaitable.isAwaitable(result) ? gameState.timelines.attachTimeline(result) : undefined;
            gameState.actionHistory.push<[boolean]>({
                action: this,
                stackModel: injection.stackModel,
                timeline,
            }, (prevVisible) => {
                gameState.setNvlVisibility(prevVisible);
            }, [previousVisible]);

            return result;
        } else if (this.type === SceneActionTypes.nvlEnd) {
            const [options] = (this.contentNode as ContentNode<SceneActionContentType["scene:nvlEnd"]>).getContent();
            const exitSnapshot = gameState.createNvlSnapshot();
            gameState.actionHistory.push<[NvlState]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevSnapshot) => {
                gameState.restoreNvlSnapshot(prevSnapshot);
            }, [exitSnapshot]);
            gameState.exitNvlMode(options || null);
            
            return {
                type: this.type,
                node: null
            };
        }

        throw new Error("Unknown scene action type: " + this.type);
    }

    getFutureActions(story: Story, searchOptions: ActionSearchOptions = {}): LogicAction.Actions[] {
        if (this.type === SceneActionTypes.callTo && searchOptions.allowFutureScene !== false) {
            const targetScene = (this.contentNode as ContentNode<SceneActionContentType["scene:callTo"]>).getContent()[0];
            const scene = story.getScene(targetScene, true);

            if (!scene.isSceneRootConstructed()) {
                scene.constructSceneRoot(story);
            }

            // Both, and that is the difference from a jump: a call comes back, so the action after
            // it is as much a future of this one as the scene it calls. Dropping it would leave
            // everything after the call out of the action map a save is restored against.
            const sceneRootNode = scene.getSceneRoot()?.contentNode;
            const returnTo = this.contentNode.getChild()?.action;
            return [
                ...(sceneRootNode?.action ? [sceneRootNode.action] : []),
                ...(returnTo ? [returnTo] : []),
            ];
        }

        if (this.type === SceneActionTypes.jumpTo && searchOptions.allowFutureScene !== false) {
            const targetScene = (this.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0];
            const scene = story.getScene(targetScene, true);

            if (!scene.isSceneRootConstructed()) {
                scene.constructSceneRoot(story);
            }

            const sceneRootNode = story.getScene(targetScene, true).getSceneRoot()?.contentNode;
            return sceneRootNode?.action ? [sceneRootNode.action] : [];
        }
        
        if (this.type === SceneActionTypes.nvlBlock) {
            const [actions] = (this.contentNode as ContentNode<SceneActionContentType["scene:nvlBlock"]>).getContent();
            const childActions = super.getFutureActions(story, searchOptions);
            return [...(actions ?? []), ...childActions];
        }

        const action = this.contentNode.getChild()?.action;
        return action ? [action] : [];
    }

    _sceneNotFoundError(sceneId: string): Error {
        return new RuntimeScriptError(`Scene with name ${sceneId} not found`
            + "\nMake sure you have registered the scene using story.register",
        this);
    }

    _callerAlreadyParkedError(target: Scene | string): Error {
        const caller = this.getSceneName(this.callee);
        return new RuntimeScriptError(
            `Cannot call scene ${this.getSceneName(target)} from ${caller}: `
            + `${caller} is already parked behind another call.`
            + "\nA returnable jump suspends the scene it is taken from, and a scene has one place on"
            + " the stage, so two calls cannot be open from the same scene at the same time. Take the"
            + " calls one after the other in a single branch rather than one per branch of a"
            + " concurrent group.",
            this
        );
    }

    getSceneName(scene: Scene | string): string {
        return typeof scene === "string" ? scene : scene.config.name;
    }

    stringify(story: Story, seen: Set<LogicAction.Actions>, _strict: boolean): string {
        if (this.type === SceneActionTypes.callTo) {
            if (seen.has(this)) {
                return super.stringifyWithContent("Scene", "[[recursive]]");
            }
            seen.add(this);

            const [targetScene] = (this.contentNode as ContentNode<SceneActionContentType["scene:callTo"]>).getContent();

            return super.stringifyWithContent("Scene", `callTo {${targetScene.stringify(story, seen, _strict)}}`);
        }

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