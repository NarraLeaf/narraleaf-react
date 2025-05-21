import {TagGroupDefinition} from "@core/elements/displayable/image";
import {ScriptCtx} from "@core/elements/script";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {TransitionAnimationType, TransitionTask} from "@core/elements/transition/type";

export type {
    TagGroupDefinition,
};
export type LambdaCtx = ScriptCtx;
export type LambdaHandler<T = any> = (ctx: LambdaCtx) => T;

export type FadeOptions = {
    start?: number;
    end: number;
    duration: number;
};

export type ChainedActions = (Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>> | LogicAction.Actions)[];
export type ActionStatements = ChainedActions | string[];
export type {
    TransitionAnimationType,
    TransitionTask,
};
