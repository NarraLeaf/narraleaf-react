import {ConditionActionContentType, ConditionActionTypes} from "@core/action/actionTypes";
import type {Condition, ConditionData, Lambda} from "@core/elements/condition";
import {GameState} from "@player/gameState";
import {LogicAction} from "@core/action/logicAction";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";
import {ActionSearchOptions} from "@core/types";
import { ContentNode } from "@core/action/tree/actionTree";
import { ActionExecutionInjection } from "../action";

export class ConditionAction<T extends typeof ConditionActionTypes[keyof typeof ConditionActionTypes] = typeof ConditionActionTypes[keyof typeof ConditionActionTypes]>
    extends TypedAction<ConditionActionContentType, T, Condition> {
    static ActionTypes = ConditionActionTypes;

    executeAction(gameState: GameState, injection: ActionExecutionInjection) {
        const nodes = this.callee.evaluate(this.contentNode.getContent(), {
            gameState
        });

        if (!nodes?.length) {
            return super.executeAction(gameState, injection);
        }

        return [
            {
                type: this.type,
                node: this.contentNode.getChild(),
            },
            {
                type: this.type,
                node: nodes[0].contentNode,
            }
        ];
    }

    getFutureActions(story: Story, options: ActionSearchOptions): LogicAction.Actions[] {
        return [...this.callee._getFutureActions(), ...super.getFutureActions(story, options)];
    }

    stringify(story: Story, seen: Set<LogicAction.Actions>, strict: boolean): string {
        const conditionData: ConditionData = (this.contentNode as ContentNode<ConditionActionContentType[typeof ConditionActionTypes.action]>).getContent();
        const toString = (data: {
            condition?: Lambda | null;
            action: LogicAction.Actions[] | null;
        }) => {
            const condition = data.condition ? (
                strict ? data.condition.toString() : "Lambda(unknown)"
            ) : "null";
            const action = data.action ? (
                data.action.map(action => action.stringify(story, seen, strict)).join(";")
            ) : "null";
            return `(${condition}) {${action}}`;
        };
        return super.stringifyWithContent("Condition", 
            `if ${toString(conditionData.If)} ${conditionData.ElseIf.length > 0 ? `else if ${conditionData.ElseIf.map(toString).join(";")} ` : ""}${conditionData.Else ? `else {${toString(conditionData.Else)}}` : ""}`
        );
    }
}