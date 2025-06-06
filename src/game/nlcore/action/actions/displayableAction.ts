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
import { ActionExecutionInjection, ExecutedActionResult } from "../action";

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
        } else if (this.type === DisplayableActionTypes.init) {
            const [scene, layer, isElement] = (this.contentNode as ContentNode<DisplayableActionContentType<TransitionType>["displayable:init"]>).getContent();
            const element = this.callee;

            return this.initDisplayable(gameState, scene, element, layer || null, isElement, injection);
        }

        throw this.unknownTypeError();
    }

    public applyTransform(state: GameState, element: Displayable<any, any>, transform: Transform, injection: ActionExecutionInjection, onFinished?: () => void) {
        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Displayable Transition", "Skipped");
                return super.executeAction(state, injection) as CalledActionResult;
            }));
        const exposed = state.getExposedStateForce<LogicAction.DisplayableExposed>(element);
        const originalTransform = element.transformState.clone();
        const task = exposed.applyTransform(transform, () => {
            onFinished?.();
            awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
        });
        const timeline = state.timelines
            .attachTimeline(awaitable)
            .attachChild(task);

        state.actionHistory.push<[TransformState<any>]>({
            action: this,
            stackModel: injection.stackModel,
            timeline
        }, (originalTransform) => {
            if (!awaitable.isSettled()) {
                awaitable.abort();
            }
            task.abort();
            element.transformState
                .forceOverwrite(originalTransform.state);
        }, [originalTransform]);

        return awaitable;
    }

    public applyTransition(state: GameState, element: Displayable<any, any>, transition: TransitionType, injection: ActionExecutionInjection, onFinished?: () => void) {
        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Displayable Transition", "Skipped");
                return super.executeAction(state, injection) as CalledActionResult;
            }));
        const exposed = state.getExposedStateForce<LogicAction.DisplayableExposed>(element);
        const task = exposed.applyTransition(transition, () => {
            onFinished?.();
            awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
        });
        const timeline = state.timelines
            .attachTimeline(awaitable)
            .attachChild(task);
            
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
}