import {ConditionActionContentType, ConditionActionTypes} from "@core/action/actionTypes";
import type {Condition} from "@core/elements/condition";
import {GameState} from "@player/gameState";
import {LogicAction} from "@core/action/logicAction";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";

export class ConditionAction<T extends typeof ConditionActionTypes[keyof typeof ConditionActionTypes] = typeof ConditionActionTypes[keyof typeof ConditionActionTypes]>
    extends TypedAction<ConditionActionContentType, T, Condition> {
    static ActionTypes = ConditionActionTypes;

    executeAction(gameState: GameState) {
        const nodes = this.callee.evaluate(this.contentNode.getContent(), {
            gameState
        });
        nodes?.[nodes.length - 1]?.contentNode.addChild(this.contentNode.getChild());
        this.contentNode.addChild(nodes?.[0]?.contentNode || null);
        return {
            type: this.type as any,
            node: this.contentNode.getChild(),
        };
    }

    getFutureActions(story: Story): LogicAction.Actions[] {
        return [...this.callee._getFutureActions(), ...super.getFutureActions(story)];
    }
}