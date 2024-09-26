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
    handler: ScriptRun;
    cleaner: ScriptCleaner | null = null;

    constructor(handler: ScriptRun) {
        super(Actionable.IdPrefixes.Script);
        this.handler = handler;
        return this.chain() satisfies Proxied<Script, Chained<LogicAction.Actions>>;
    }

    execute({gameState}: { gameState: GameState }): void {
        this.cleaner = this.handler(this.getCtx({
            gameState
        })) || null;
    }

    getCtx({gameState}: { gameState: GameState }): ScriptCtx {
        return {
            script: this,
            gameState
        };
    }

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

