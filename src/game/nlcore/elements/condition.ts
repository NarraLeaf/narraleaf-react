import {ContentNode, RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Actionable} from "@core/action/actionable";
import {GameState} from "@player/gameState";
import {Chained, Proxied} from "@core/action/chain";
import {StaticScriptWarning} from "@core/common/Utils";
import {ConditionAction} from "@core/action/actions/conditionAction";
import {LambdaCtx, LambdaHandler, ActionStatements} from "@core/elements/type";
import Actions = LogicAction.Actions;
import { Narrator } from "./character";

export class Lambda<T = any> {
    /**@internal */
    public static isLambda(value: any): value is Lambda {
        return value instanceof Lambda && "handler" in value;
    }

    /**@internal */
    public static from<T>(obj: Lambda<T> | LambdaHandler<T>): Lambda<T> {
        return Lambda.isLambda(obj) ? obj : new Lambda(obj);
    }

    /**@internal */
    handler: LambdaHandler<T>;

    /**@internal */
    constructor(handler: LambdaHandler) {
        this.handler = handler;
    }

    /**@internal */
    evaluate({gameState}: { gameState: GameState }): {
        value: T;
    } {
        const value = this.handler(this.getCtx({gameState}));
        return {
            value,
        };
    }

    /**@internal */
    getCtx({gameState}: { gameState: GameState }): LambdaCtx {
        return {
            gameState,
            game: gameState.game,
            liveGame: gameState.game.getLiveGame(),
            storable: gameState.game.getLiveGame().getStorable(),
        };
    }
}

/**@internal */
export type ConditionData = {
    If: {
        condition: Lambda | null;
        action: LogicAction.Actions[] | null;
    };
    ElseIf: {
        condition: Lambda | null;
        action: (LogicAction.Actions[]) | null;
    }[];
    Else: {
        action: (LogicAction.Actions[]) | null;
    }
};

export class Condition<Closed extends true | false = false> extends Actionable {
    /**@internal */
    static getInitialState(): ConditionData {
        return {
            If: {
                condition: null,
                action: null
            },
            ElseIf: [],
            Else: {
                action: null
            }
        };
    }

    /**
     * @chainable
     */
    public static If(
        condition: Lambda | LambdaHandler<boolean>, action: ActionStatements
    ): Proxied<Condition, Chained<LogicAction.Actions>> {
        return new Condition().createIfCondition(condition, action);
    }

    /**@internal */
    conditions: ConditionData = {
        If: {
            condition: null,
            action: null
        },
        ElseIf: [],
        Else: {
            action: null
        }
    };

    /**@internal */
    private constructor() {
        super();
    }

    /**
     * @chainable
     */
    public ElseIf(
        condition: Closed extends false ? (Lambda | LambdaHandler<boolean>) : never,
        action: Closed extends false ? ActionStatements : never
    ): Closed extends false ? Proxied<Condition, Chained<LogicAction.Actions>> : never {
        // when ELSE condition already set
        if (this.conditions.Else.action) {
            throw new StaticScriptWarning("ELSE condition already set\nYou are trying to set an ELSE-IF condition after an ELSE condition");
        }

        this.conditions.ElseIf.push({
            condition: Lambda.isLambda(condition) ? condition : new Lambda(condition),
            action: this.construct(Array.isArray(action) ? action : [action])
        });
        return this.chain();
    }

    /**
     * @chainable
     */
    public Else(
        action: Closed extends false ? ActionStatements : never
    ): Closed extends false ? Proxied<Condition<true>, Chained<LogicAction.Actions>> : never {
        // when ELSE condition already set
        if (this.conditions.Else.action) {
            throw new StaticScriptWarning("ELSE condition already set\nYou are trying to set multiple ELSE conditions for the same condition");
        }

        this.conditions.Else.action = this.construct(Array.isArray(action) ? action : [action]);
        return this.chain();
    }

    /**@internal */
    evaluate(conditions: ConditionData, {gameState}: { gameState: GameState }): LogicAction.Actions[] | null {
        const ctx = {gameState};

        const _if = conditions.If.condition?.evaluate(ctx);
        if (_if?.value) {
            return conditions.If.action || null;
        }

        for (const elseIf of conditions.ElseIf) {
            const _elseIf = elseIf.condition?.evaluate(ctx);
            if (_elseIf?.value) {
                return elseIf.action || null;
            }
        }

        return conditions.Else.action || null;
    }

    /**@internal */
    override fromChained(chained: Proxied<Condition, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return [
            Reflect.construct(ConditionAction, [
                this,
                ConditionAction.ActionTypes.action,
                new ContentNode<ConditionData>().setContent(chained.conditions)
            ]) as ConditionAction<typeof ConditionAction.ActionTypes.action>
        ];
    }

    /**@internal */
    construct(chainedActions: ActionStatements, lastChild?: RenderableNode, parentChild?: RenderableNode): LogicAction.Actions[] {
        const actions: Actions[] = this.narrativeToActions(chainedActions);
        for (let i = 0; i < actions.length; i++) {
            const node = actions[i].contentNode;
            const child = actions[i + 1]?.contentNode;
            if (child) {
                node.setChild(child);
            }
            if (i === actions.length - 1 && lastChild) {
                node.setChild(lastChild);
            }
            if (i === 0 && parentChild) {
                parentChild.setChild(node);
            }
        }
        return actions;
    }

    /**@internal */
    _getFutureActions(): LogicAction.Actions[] {
        return Chained.toActions([
            (this.conditions.If.action?.[0] || []),
            ...this.conditions.ElseIf.flatMap(e => e.action?.[0] || []),
            (this.conditions.Else.action?.[0] || [])
        ]);
    }

    /**@internal */
    private createIfCondition(
        condition: Lambda | LambdaHandler<boolean>, action: ActionStatements
    ): Proxied<Condition, Chained<LogicAction.Actions>> {
        this.conditions.If.condition = condition instanceof Lambda ? condition : new Lambda(condition);
        this.conditions.If.action = this.construct(action);
        return this.chain();
    }

    /**@internal */
    narrativeToActions(statements: ActionStatements): LogicAction.Actions[] {
        return statements.flatMap(statement => {
            if (typeof statement === "string") {
                return Narrator.say(statement).getActions();
            }
            return Chained.toActions([statement]);
        });
    }
}
