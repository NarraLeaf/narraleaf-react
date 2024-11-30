import {TagGroupDefinition} from "@core/elements/displayable/image";
import {ScriptCtx} from "@core/elements/script";

export type {
    TagGroupDefinition,
};
export type LambdaCtx = ScriptCtx;
export type LambdaHandler<T = any> = (ctx: LambdaCtx) => T;