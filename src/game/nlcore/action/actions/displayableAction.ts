import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {GameState} from "@player/gameState";
import {TypedAction} from "@core/action/actions";
import {Values} from "@lib/util/data";
import {Displayable} from "@core/elements/displayable/displayable";


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
        }

        throw this.unknownTypeError();
    }
}