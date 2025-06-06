import {ConditionActionContentType, ConditionActionTypes} from "@core/action/actionTypes";
import type {Condition} from "@core/elements/condition";
import {GameState} from "@player/gameState";
import {LogicAction} from "@core/action/logicAction";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";
import {ActionSearchOptions} from "@core/types";

export class ConditionAction<T extends typeof ConditionActionTypes[keyof typeof ConditionActionTypes] = typeof ConditionActionTypes[keyof typeof ConditionActionTypes]>
    extends TypedAction<ConditionActionContentType, T, Condition> {
    static ActionTypes = ConditionActionTypes;

    executeAction(gameState: GameState) {
        const nodes = this.callee.evaluate(this.contentNode.getContent(), {
            gameState
        });

        const stackModel = gameState.getLiveGame().createStackModel([
            {
                type: this.type,
                node: nodes?.[0]?.contentNode ?? null
            }
        ]);
        return [
            {
                type: this.type,
                node: this.contentNode.getChild(),
            },
            {
                type: this.type,
                node: null,
                wait: {
                    type: "all" as const,
                    stackModels: [stackModel]
                }
            }
        ];
    }

    getFutureActions(story: Story, options: ActionSearchOptions): LogicAction.Actions[] {
        return [...this.callee._getFutureActions(), ...super.getFutureActions(story, options)];
    }
}