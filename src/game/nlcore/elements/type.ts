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

/**
 * What {@link AudioManager.play} is asked for, on top of the fade.
 *
 * `waitForEnd` is what decides whether the action that started the clip holds the script until the
 * clip finishes. A sound effect written between two lines is not a wait the author asked for - a
 * seven-second chime stopped the script for seven seconds with nothing on screen saying why - so
 * {@link Sound.play} leaves it off and a row that means "hold here" turns it on.
 */
export type SoundPlayOptions = FadeOptions & {
    /** Resolve only once the clip has finished playing. Ignored for a looping clip. */
    waitForEnd?: boolean;
};

export type ChainedActions = (Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>> | LogicAction.Actions)[];
export type ActionStatements = ChainedActions | string[];
export type {
    TransitionAnimationType,
    TransitionTask,
};
