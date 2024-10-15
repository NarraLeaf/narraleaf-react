import {ScriptActionContentType, ScriptActionTypes} from "@core/action/actionTypes";
import type {Script} from "@core/elements/script";
import {GameState} from "@player/gameState";
import {TypedAction} from "@core/action/actions";

export class ScriptAction<T extends typeof ScriptActionTypes[keyof typeof ScriptActionTypes] = typeof ScriptActionTypes[keyof typeof ScriptActionTypes]>
    extends TypedAction<ScriptActionContentType, T, Script> {
    static ActionTypes = ScriptActionTypes;

    public executeAction(gameState: GameState) {
        this.contentNode.getContent().execute({
            gameState,
        });
        return super.executeAction(gameState);
    }
}