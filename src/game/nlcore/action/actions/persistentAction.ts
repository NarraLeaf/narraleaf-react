import {PersistentActionContentType, PersistentActionTypes} from "@core/action/actionTypes";
import {GameState} from "@player/gameState";
import {TypedAction} from "@core/action/actions";
import {Values} from "@lib/util/data";
import {Persistent} from "@core/elements/persistent";

export class PersistentAction<T extends Values<typeof PersistentActionTypes> = Values<typeof PersistentActionTypes>>
    extends TypedAction<PersistentActionContentType, T, Persistent<any>> {
    static ActionTypes = PersistentActionTypes;

    executeAction(gameState: GameState) {
        const action: PersistentAction = this;
        if (action.is<PersistentAction<"persistent:set">>(PersistentAction, "persistent:set")) {
            const [key, value] = action.contentNode.getContent();
            gameState.getStorable().getNamespace(
                action.callee.getNamespaceName()
            ).set(key, value);
            return super.executeAction(gameState);
        }

        throw this.unknownTypeError();
    }
}