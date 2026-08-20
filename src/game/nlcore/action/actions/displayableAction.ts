import { DisplayableActionContentType, DisplayableActionTypes } from "@core/action/actionTypes";
import { GameState } from "@player/gameState";
import { TypedAction } from "@core/action/actions";
import { Awaitable, SkipController, Values } from "@lib/util/data";
import { Displayable } from "@core/elements/displayable/displayable";
import { ContentNode } from "@core/action/tree/actionTree";
import type { CalledActionResult } from "@core/gameTypes";
import { Scene } from "@core/elements/scene";
import { Transform, TransformState } from "@core/elements/transform/transform";
import { Transition } from "@core/elements/transition/transition";
import { Layer } from "@core/elements/layer";
import { LogicAction } from "@core/action/logicAction";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { Story } from "@core/elements/story";
import { RuntimeGameError } from "@core/common/Utils";
import type { PlayerStateElement } from "@player/gameState";
import type { TransformDefinitions } from "@core/elements/transform/type";
import type { DisplayableLoopBinding } from "@player/elements/displayable/type";

export class DisplayableAction<
    T extends Values<typeof DisplayableActionTypes> = Values<typeof DisplayableActionTypes>,
    Self extends Displayable<any, any, any> = Displayable<any, any>,
    TransitionType extends Transition = Transition,
>
    extends TypedAction<DisplayableActionContentType<TransitionType>, T, Self> {
    static ActionTypes = DisplayableActionTypes;

    public executeAction(gameState: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        if (this.type === DisplayableActionTypes.applyTransform) {
            const [transform] = (this.contentNode as ContentNode<DisplayableActionContentType<TransitionType>["displayable:applyTransform"]>).getContent();
            const element = this.callee;

            return this.applyTransform(gameState, element, transform, injection);
        } else if (this.type === DisplayableActionTypes.applyTransition) {
            const [trans, handler] = (this.contentNode as ContentNode<DisplayableActionContentType<TransitionType>["displayable:applyTransition"]>).getContent();
            const element = this.callee;

            const transition: TransitionType = handler ? handler(trans) : trans;

            return this.applyTransition(gameState, element, transition, injection);
        } else if (this.type === DisplayableActionTypes.applyLoop) {
            const [transform, options] = (this.contentNode as ContentNode<DisplayableActionContentType<TransitionType>["displayable:applyLoop"]>).getContent();

            return this.applyLoop(gameState, this.callee, transform, options, injection);
        } else if (this.type === DisplayableActionTypes.stopLoop) {
            const [options] = (this.contentNode as ContentNode<DisplayableActionContentType<TransitionType>["displayable:stopLoop"]>).getContent();

            return this.stopLoop(gameState, this.callee, options, injection);
        } else if (this.type === DisplayableActionTypes.init) {
            const [scene, layer, isElement] = (this.contentNode as ContentNode<DisplayableActionContentType<TransitionType>["displayable:init"]>).getContent();
            const element = this.callee;

            return this.initDisplayable(gameState, scene, element, layer || null, isElement, injection);
        } else if (this.type === DisplayableActionTypes.bringToFront) {
            return this.bringToFront(gameState, this.callee, injection);
        }

        throw this.unknownTypeError();
    }

    public applyTransform(state: GameState, element: Displayable<any, any>, transform: Transform, injection: ActionExecutionInjection, onFinished?: () => void) {
        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Displayable Transition", "Skipped");
                return super.executeAction(state, injection) as CalledActionResult;
            }));
        const resolveAction = () => {
            if (awaitable.isSettled()) {
                return;
            }
            onFinished?.();
            awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
        };
        const exposed = state.getExposedStateForce<LogicAction.DisplayableExposed>(element);
        const originalTransform = element.transformState.clone();
        // An element carries one transform at a time, so an authored transform ends a loop. Only
        // this action clears the binding: the host stops the motion for any transform at all, but a
        // repaint (a mount, `GameState.forceAnimation` after an undo) is not the story asking for
        // the element's pose back, and the binding is what makes the loop resume after one.
        const originalLoop = element._getLoop();
        const originalLoopActionId = element._getLoopActionId();
        if (originalLoop) {
            element._setLoop(null, {}, null);
            element.markDirty();
        }
        const task = exposed.applyTransform(transform, resolveAction);
        const timeline = state.timelines
            .attachTimeline(awaitable)
            .attachChild(task);
        task.onCancelled(resolveAction);

        state.actionHistory.push<[TransformState<any>, DisplayableLoopBinding | null, string | null]>({
            action: this,
            stackModel: injection.stackModel,
            timeline
        }, (originalTransform, originalLoop, originalLoopActionId) => {
            if (!awaitable.isSettled()) {
                awaitable.abort();
            }
            task.abort();
            element.transformState
                .forceOverwrite(originalTransform.state);
            DisplayableAction.restoreLoop(state, element, originalLoop, originalLoopActionId);
        }, [originalTransform, originalLoop, originalLoopActionId]);

        return awaitable;
    }

    /**
     * Start a looping transform on the element, and let the story carry straight on.
     *
     * The one action here that resolves without waiting for anything, because there is nothing to
     * wait for: the motion repeats until something ends it. Nothing is attached to a timeline and
     * nothing is left unsettled on the stack — a loop is a property the element carries (see
     * {@link Displayable.loop}), so it is the element's binding, not this action, that a save and a
     * remount read.
     */
    public applyLoop(
        state: GameState,
        element: Displayable<any, any>,
        transform: Transform,
        options: TransformDefinitions.LoopOptions | undefined,
        injection: ActionExecutionInjection
    ): Awaitable<CalledActionResult> {
        const originalLoop = element._getLoop();
        const originalLoopActionId = element._getLoopActionId();
        const loopOptions = options ?? {};

        element._setLoop(transform, loopOptions, this.getId());
        element.markDirty();
        // Absent when the element is not on stage yet. Nothing is lost: the binding is set, and the
        // host reconciles from it the moment it mounts.
        state.getExposedState<LogicAction.DisplayableExposed>(element)?.applyLoop(transform, loopOptions);

        state.actionHistory.push<[DisplayableLoopBinding | null, string | null]>({
            action: this,
            stackModel: injection.stackModel,
        }, (originalLoop, originalLoopActionId) => {
            DisplayableAction.restoreLoop(state, element, originalLoop, originalLoopActionId);
        }, [originalLoop, originalLoopActionId]);

        const awaitable = new Awaitable<CalledActionResult>();
        awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);

        return awaitable;
    }

    /**
     * End the element's looping transform and ease it back to the pose it kept underneath.
     *
     * Unlike {@link DisplayableAction.applyLoop} this *is* awaited — the way back has a duration,
     * even when that duration is zero.
     */
    public stopLoop(
        state: GameState,
        element: Displayable<any, any>,
        options: TransformDefinitions.LoopStopOptions | undefined,
        injection: ActionExecutionInjection
    ): Awaitable<CalledActionResult> {
        const originalLoop = element._getLoop();
        const originalLoopActionId = element._getLoopActionId();

        element._setLoop(null, {}, null);
        element.markDirty();

        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Displayable Loop", "Skipped");
                return super.executeAction(state, injection) as CalledActionResult;
            }));
        const resolveAction = () => {
            if (awaitable.isSettled()) {
                return;
            }
            awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
        };
        const exposed = state.getExposedState<LogicAction.DisplayableExposed>(element);

        if (!exposed || !originalLoop) {
            // Nothing to end - either the element is not on stage, or it was not looping. The
            // second case has to skip the host entirely rather than travel back to a pose it never
            // left: the way back is an ordinary transform, and running one would cancel whatever
            // move the element happens to be in the middle of.
            state.actionHistory.push<[DisplayableLoopBinding | null, string | null]>({
                action: this,
                stackModel: injection.stackModel,
            }, (originalLoop, originalLoopActionId) => {
                DisplayableAction.restoreLoop(state, element, originalLoop, originalLoopActionId);
            }, [originalLoop, originalLoopActionId]);
            resolveAction();

            return awaitable;
        }

        const task = exposed.stopLoop(options, resolveAction);
        const timeline = state.timelines
            .attachTimeline(awaitable)
            .attachChild(task);
        task.onCancelled(resolveAction);

        state.actionHistory.push<[DisplayableLoopBinding | null, string | null]>({
            action: this,
            stackModel: injection.stackModel,
            timeline
        }, (originalLoop, originalLoopActionId) => {
            if (!awaitable.isSettled()) {
                awaitable.abort();
            }
            task.abort();
            DisplayableAction.restoreLoop(state, element, originalLoop, originalLoopActionId);
        }, [originalLoop, originalLoopActionId]);

        return awaitable;
    }

    /**
     * Put an element's loop binding back to what it was, and make the running motion agree.
     *
     * Both halves are needed and neither is enough: the binding is what a save and a remount read,
     * the motion is what the player sees. Undoing past a `loop()` has to stop a motion that is
     * running right now; undoing past a `stopLoop()` has to start one that is not.
     */
    private static restoreLoop(
        state: GameState,
        element: Displayable<any, any>,
        binding: DisplayableLoopBinding | null,
        actionId: string | null
    ): void {
        // Nothing to put back and nothing running: leave the element completely alone.
        //
        // Load-bearing, because this runs on the undo of EVERY transform, and the way back from a
        // loop is an ordinary transform. Without the guard, stepping back past a row that never
        // touched a loop would still run a zero-duration transform on its subject - which aborts
        // whatever else that element had in flight (a concurrent `Control.allAsync` move) and marks
        // it dirty for the next save, both for a row that had no loop to restore.
        if (!binding && !element._getLoop()) {
            return;
        }
        element._setLoop(binding?.transform ?? null, binding?.options ?? {}, actionId);
        element.markDirty();

        const exposed = state.getExposedState<LogicAction.DisplayableExposed>(element);
        if (!exposed) {
            return;
        }
        if (binding) {
            exposed.applyLoop(binding.transform, binding.options);
        } else {
            exposed.stopLoop(undefined, () => {});
        }
    }

    public applyTransition(state: GameState, element: Displayable<any, any>, transition: TransitionType, injection: ActionExecutionInjection, onFinished?: () => void) {
        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Displayable Transition", "Skipped");
                return super.executeAction(state, injection) as CalledActionResult;
            }));
        const resolveAction = () => {
            if (awaitable.isSettled()) {
                return;
            }
            onFinished?.();
            awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
        };
        const exposed = state.getExposedStateForce<LogicAction.DisplayableExposed>(element);
        const task = exposed.applyTransition(transition, resolveAction);
        const timeline = state.timelines
            .attachTimeline(awaitable)
            .attachChild(task);
        task.onCancelled(resolveAction);
            
        state.actionHistory.push<[]>({
            action: this,
            stackModel: injection.stackModel,
            timeline
        }, () => {
            if (!awaitable.isSettled()) {
                awaitable.abort();
            }
            task.abort();
        });

        return awaitable;
    }

    public initDisplayable(state: GameState, scene: Scene | null, element: Displayable<any, any>, layer: Layer | null, isElement: boolean | undefined = true, injection: ActionExecutionInjection): Awaitable<CalledActionResult> {
        if (isElement !== false) {
            const lastScene = state.findElementByDisplayable(this.callee, layer);
            if (lastScene) {
                state.disposeDisplayable(element, lastScene.scene, layer);
            }

            state.createDisplayable(element, scene, layer);
        }
        state.flush();

        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() =>
                super.executeAction(state, injection) as CalledActionResult));
        state.getExposedStateAsync<LogicAction.DisplayableExposed>(element, (exposed) => {
            exposed.initDisplayable(() => {
                awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
            });
        });
        const timeline = state.timelines.attachTimeline(awaitable);
        state.actionHistory.push({
            action: this,
            stackModel: injection.stackModel,
            timeline
        }, () => {
            if (isElement !== false && state.findElementByDisplayable(element, layer)) {
                state.disposeDisplayable(element, scene, layer);
            }
        });

        return awaitable;
    }

    /**
     * Move the element to the end of the array its layer draws from.
     *
     * A layer renders its elements in array order, so the last entry is the one drawn on top; there
     * is no per-element depth number to set. Reordering the array rather than introducing one is
     * what keeps this saveable for free — {@link GameState.toData} writes each layer out as a list
     * of ids in exactly this order, and loading rebuilds the array from it.
     *
     * Nothing is tweened, so the returned awaitable is settled before it is handed back.
     */
    public bringToFront(state: GameState, element: Displayable<any, any>, injection: ActionExecutionInjection): Awaitable<CalledActionResult> {
        const target = state.findElementByDisplayable(element);
        const elements = target && DisplayableAction.getLayerElements(target, element);
        if (!elements) {
            throw new RuntimeGameError(
                `Displayable not found when bringing it to front. The element may not be on stage yet. (element: ${element.getId()})`
            );
        }

        const oldIndex = elements.indexOf(element);
        if (oldIndex !== elements.length - 1) {
            elements.splice(oldIndex, 1);
            elements.push(element);
            state.flush();
        }

        state.actionHistory.push<[number]>({
            action: this,
            stackModel: injection.stackModel,
        }, (oldIndex) => {
            // Resolved again rather than closed over: a save loaded in between replaces the layer
            // arrays wholesale, and putting the element back into an orphaned one would move nothing.
            const current = state.findElementByDisplayable(element);
            const currentElements = current && DisplayableAction.getLayerElements(current, element);
            if (!currentElements) {
                return;
            }

            const currentIndex = currentElements.indexOf(element);
            if (currentIndex === oldIndex) {
                return;
            }

            currentElements.splice(currentIndex, 1);
            currentElements.splice(oldIndex, 0, element);
            state.flush();
        }, [oldIndex]);

        const awaitable = new Awaitable<CalledActionResult>();
        awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);

        return awaitable;
    }

    /**
     * The array of the scene's layer that currently holds this element, or null if none does.
     */
    private static getLayerElements(
        target: PlayerStateElement,
        element: LogicAction.DisplayableElements
    ): LogicAction.DisplayableElements[] | null {
        for (const elements of target.layers.values()) {
            if (elements.includes(element)) {
                return elements;
            }
        }
        return null;
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("DisplayableAction");
    }
}
