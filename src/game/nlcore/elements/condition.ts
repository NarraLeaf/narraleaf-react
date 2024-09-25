import {deepMerge} from "@lib/util/data";
import {Game} from "../game";
import {ContentNode, RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ConditionAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import {GameState} from "@player/gameState";
import {Chained, ChainedActions, Proxied} from "@core/action/chain";
import Actions = LogicAction.Actions;

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type ConditionConfig = {};

interface LambdaCtx {
    gameState: GameState;
}

type LambdaHandler<T = any> = (ctx: LambdaCtx) => T;

export class Lambda {
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
            gameState
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

export class Condition extends Actionable {
    static defaultConfig: ConditionConfig = {};

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

    readonly config: ConditionConfig;
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

    constructor(config: ConditionConfig = {}) {
        super(Actionable.IdPrefixes.Condition);
        this.config = deepMerge<ConditionConfig>(Condition.defaultConfig, config);
    }

    public If(
        condition: Lambda | LambdaHandler<boolean>, action: ChainedActions
    ): Proxied<Condition, Chained<LogicAction.Actions>> {
        this.conditions.If.condition = condition instanceof Lambda ? condition : new Lambda(condition);
        this.conditions.If.action = this.construct(Array.isArray(action) ? action : [action]);
        return this.chain();
    }

    public ElseIf(
        condition: Lambda | LambdaHandler<boolean>, action: ChainedActions
    ): Proxied<Condition, Chained<LogicAction.Actions>> {
        this.conditions.ElseIf.push({
            condition: condition instanceof Lambda ? condition : new Lambda(condition),
            action: this.construct(Array.isArray(action) ? action : [action])
        });
        return this.chain();
    }

    public Else(
        action: ChainedActions
    ): Proxied<Condition, Chained<LogicAction.Actions>> {
        this.conditions.Else.action = this.construct(Array.isArray(action) ? action : [action]);
        return this.chain();
    }

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

    override fromChained(chained: Proxied<Condition, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return [
            Reflect.construct(ConditionAction, [
                this,
                ConditionAction.ActionTypes.action,
                new ContentNode<ConditionData>(Game.getIdManager().getStringId()).setContent(chained.conditions)
            ]) as ConditionAction<typeof ConditionAction.ActionTypes.action>
        ];
    }

    construct(chainedActions: ChainedActions, lastChild?: RenderableNode, parentChild?: RenderableNode): LogicAction.Actions[] {
        const actions: Actions[] = Chained.toActions(chainedActions);
        for (let i = 0; i < actions.length; i++) {
            const node = actions[i].contentNode;
            const child = actions[i + 1]?.contentNode;
            if (child) {
                node.setInitChild(child);
            }
            if (i === actions.length - 1 && lastChild) {
                node.setInitChild(lastChild);
            }
            if (i === 0 && parentChild) {
                parentChild.setInitChild(node);
            }
        }
        return actions;
    }

    _getFutureActions(): LogicAction.Actions[] {
        return [
            ...(this.conditions.If.action || []),
            ...this.conditions.ElseIf.flatMap(e => e.action || []),
            ...(this.conditions.Else.action || [])
        ];
    }
}
