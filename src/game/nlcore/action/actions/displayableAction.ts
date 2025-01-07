import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {GameState} from "@player/gameState";
import {TypedAction} from "@core/action/actions";
import {Awaitable, SkipController, Values} from "@lib/util/data";
import {Displayable} from "@core/elements/displayable/displayable";
import {ContentNode} from "@core/action/tree/actionTree";
import type {CalledActionResult} from "@core/gameTypes";
import {Scene} from "@core/elements/scene";
import {ITransition} from "@core/elements/transition/type";
import {Transform} from "@core/elements/transform/transform";


export class DisplayableAction<
    T extends Values<typeof DisplayableActionTypes> = Values<typeof DisplayableActionTypes>,
    Self extends Displayable<any, any> = Displayable<any, any>
>
    extends TypedAction<DisplayableActionContentType, T, Self> {
    static ActionTypes = DisplayableActionTypes;

    public executeAction(gameState: GameState) {
        const scene = gameState.getLastSceneIfNot();
        if (this.type === DisplayableActionTypes.layerMoveUp) {
            gameState.moveUpElement(scene, this.callee);
            gameState.stage.update();

            return super.executeAction(gameState);
        } else if (this.type === DisplayableActionTypes.layerMoveDown) {
            gameState.moveDownElement(scene, this.callee);
            gameState.stage.update();

            return super.executeAction(gameState);
        } else if (this.type === DisplayableActionTypes.layerMoveTop) {
            gameState.moveTopElement(scene, this.callee);
            gameState.stage.update();

            return super.executeAction(gameState);
        } else if (this.type === DisplayableActionTypes.layerMoveBottom) {
            gameState.moveBottomElement(scene, this.callee);
            gameState.stage.update();

            return super.executeAction(gameState);
        } else if (this.type === DisplayableActionTypes.applyTransform) {
            const [transform] = (this.contentNode as ContentNode<DisplayableActionContentType["displayable:applyTransform"]>).getContent();
            const element = this.callee;

            return this.applyTransform(gameState, element, transform);
        } else if (this.type === DisplayableActionTypes.applyTransition) {
            const [transition] = (this.contentNode as ContentNode<DisplayableActionContentType["displayable:applyTransition"]>).getContent();
            const element = this.callee;

            return this.applyTransition(gameState, element, transition);
        } else if (this.type === DisplayableActionTypes.init) {
            const [scene] = (this.contentNode as ContentNode<DisplayableActionContentType["displayable:init"]>).getContent();
            const element = this.callee;

            return this.initDisplayable(gameState, scene, element);
        }

        throw this.unknownTypeError();
    }

    public applyTransform(state: GameState, element: Displayable<any, any>, transform: Transform, onFinished?: () => void) {
        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Displayable Transition", "Skipped");
                return super.executeAction(state) as CalledActionResult;
            }));
        element.events.emit(Displayable.EventTypes["event:displayable.applyTransform"], transform, () => {
            onFinished?.();
            awaitable.resolve(super.executeAction(state) as CalledActionResult);
            state.stage.next();
        });
        return awaitable;
    }

    public applyTransition(state: GameState, element: Displayable<any, any>, transition: ITransition, onFinished?: () => void) {
        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Displayable Transition", "Skipped");
                return super.executeAction(state) as CalledActionResult;
            }));
        element.events.emit(Displayable.EventTypes["event:displayable.applyTransition"], transition, () => {
            onFinished?.();
            awaitable.resolve(super.executeAction(state) as CalledActionResult);
            state.stage.next();
        });
        return awaitable;
    }

    public initDisplayable(state: GameState, scene: Scene | undefined, element: Displayable<any, any>): Awaitable<CalledActionResult> {
        const lastScene = state.findElementByDisplayable(this.callee);
        if (lastScene) {
            state.disposeDisplayable(element, lastScene.scene);
        }

        state.createDisplayable(element, scene);

        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() =>
                super.executeAction(state) as CalledActionResult));
        element.events.emit(Displayable.EventTypes["event:displayable.init"], () => {
            awaitable.resolve(super.executeAction(state) as CalledActionResult);
            state.stage.next();
        });

        return awaitable;
    }
}