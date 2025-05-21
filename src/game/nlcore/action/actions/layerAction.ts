import {LayerActionContentType, LayerActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {GameState} from "@player/gameState";
import {CalledActionResult} from "@core/gameTypes";
import {Awaitable, Values} from "@lib/util/data";
import {Layer} from "@core/elements/layer";

export class LayerAction<T extends Values<typeof LayerActionTypes> = Values<typeof LayerActionTypes>>
    extends TypedAction<LayerActionContentType, T, Layer> {
    static ActionTypes = LayerActionTypes;

    public executeAction(gameState: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === LayerActionTypes.action) {
            return super.executeAction(gameState);
        } else if (this.type === LayerActionTypes.setZIndex) {
            const [zIndex] = (this as LayerAction<typeof LayerActionTypes.setZIndex>).contentNode.getContent();
            const oldZIndex = this.callee.state.zIndex;
            this.callee.state.zIndex = zIndex;

            gameState.actionHistory.push<[number]>(this, (oldZIndex) => {
                this.callee.state.zIndex = oldZIndex;
            }, [oldZIndex]);

            gameState.stage.update();
            return super.executeAction(gameState);
        }

        throw super.unknownTypeError();
    }
}
