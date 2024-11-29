import {ContentNode, RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Actionable} from "@core/action/actionable";
import {GameState} from "@player/gameState";
import {Chained, ChainedActions, Proxied} from "@core/action/chain";
import {ScriptCtx} from "@core/elements/script";
import {StaticScriptWarning} from "@core/common/Utils";
import {ConditionAction} from "@core/action/actions/conditionAction";
import Actions = LogicAction.Actions;

type LambdaCtx = ScriptCtx;
type LambdaHandler<T = any> = (ctx: LambdaCtx) => T;

export class Lambda {
    public static isLambda(value: any): value is Lambda {
        return value instanceof Lambda && "handler" in value;
    }

    handler: LambdaHandler;

    constructor(handler: LambdaHandler) {
        this.handler = handler;
    }

    evaluate({gameState}: { gameState: GameState }): {
        value: any;
    } {
        const value = this.handler(this.getCtx({gameState}));
        return {
            value,
        };
    }

    getCtx({gameState}: { gameState: GameState }): LambdaCtx {
        return {
            gameState,
            game: gameState.game,
            liveGame: gameState.game.getLiveGame(),
            storable: gameState.game.getLiveGame().getStorable(),
        };
    }
}

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
        condition: Lambda | LambdaHandler<boolean>, action: ChainedActions
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
        action: Closed extends false ? ChainedActions : never
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
        action: Closed extends false ? ChainedActions : never
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
    construct(chainedActions: ChainedActions, lastChild?: RenderableNode, parentChild?: RenderableNode): LogicAction.Actions[] {
        const actions: Actions[] = Chained.toActions(chainedActions);
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
        condition: Lambda | LambdaHandler<boolean>, action: ChainedActions
    ): Proxied<Condition, Chained<LogicAction.Actions>> {
        this.conditions.If.condition = condition instanceof Lambda ? condition : new Lambda(condition);
        this.conditions.If.action = this.construct(Array.isArray(action) ? action : [action]);
        return this.chain();
    }
}
