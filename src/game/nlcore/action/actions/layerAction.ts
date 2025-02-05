import {LayerActionContentType, LayerActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {GameState} from "@player/gameState";
import {CalledActionResult} from "@core/gameTypes";
import {Awaitable, Values} from "@lib/util/data";
import {Layer} from "@core/elements/layer";

export class LayerAction<T extends Values<typeof LayerActionTypes> = Values<typeof LayerActionTypes>>
    extends TypedAction<LayerActionContentType, T, Layer> {
    static ActionTypes = LayerActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === LayerActionTypes.action) {
            return super.executeAction(state);
        }

        throw super.unknownTypeError();
    }
}
