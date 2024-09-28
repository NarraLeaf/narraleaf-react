import {Game} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ScriptAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import {GameState} from "@player/gameState";
import {Chained, Proxied} from "@core/action/chain";

export interface ScriptCtx {
    script: Script;
    gameState: GameState;
}

type ScriptRun = (ctx: ScriptCtx) => ScriptCleaner | void;
export type ScriptCleaner = () => void;

export class Script extends Actionable<object> {
    /**@internal */
    readonly handler: ScriptRun;

    constructor(handler: ScriptRun) {
        super();
        this.handler = handler;
        return this.chain() satisfies Proxied<Script, Chained<LogicAction.Actions>>;
    }

    /**@internal */
    execute({gameState}: { gameState: GameState }): void {
        this.handler(this.getCtx({
            gameState
        }));
    }

    /**@internal */
    getCtx({gameState}: { gameState: GameState }): ScriptCtx {
        return {
            script: this,
            gameState
        };
    }

    /**@internal */
    override fromChained(chained: Proxied<Script, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return [
            new ScriptAction(
                this.chain(),
                ScriptAction.ActionTypes.action,
                new ContentNode<Script>(Game.getIdManager().getStringId()).setContent(chained)
            )
        ];
    }
}

