import {ScriptActionContentType, ScriptActionTypes} from "@core/action/actionTypes";
import type {Script} from "@core/elements/script";
import {GameState} from "@player/gameState";
import {TypedAction} from "@core/action/actions";
import { ActionExecutionInjection } from "../action";
import { Story } from "@core/elements/story";
import { LogicAction } from "@core/action/logicAction";

export class ScriptAction<T extends typeof ScriptActionTypes[keyof typeof ScriptActionTypes] = typeof ScriptActionTypes[keyof typeof ScriptActionTypes]>
    extends TypedAction<ScriptActionContentType, T, Script> {
    static ActionTypes = ScriptActionTypes;

    public executeAction(gameState: GameState, injection: ActionExecutionInjection) {
        const cleaner = this.contentNode.getContent().execute({
            gameState,
        });
        if (cleaner) {
            gameState.actionHistory.push({
                action: this,
                stackModel: injection.stackModel
            }, () => {
                cleaner();
            }, []);
        }
        return super.executeAction(gameState, injection);
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("ScriptAction");
    }
}