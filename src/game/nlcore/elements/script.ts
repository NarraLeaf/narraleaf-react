import {Game} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Actionable} from "@core/action/actionable";
import {GameState} from "@player/gameState";
import {Chained, Proxied} from "@core/action/chain";
import type {Storable} from "@core/elements/persistent/storable";
import {ScriptAction} from "@core/action/actions/scriptAction";
import {LiveGame} from "@core/game/liveGame";

export interface ScriptCtx {
    gameState: GameState;
    game: Game;
    liveGame: LiveGame;
    storable: Storable;
}

type ScriptRun = (ctx: ScriptCtx) => ScriptCleaner | void;
export type ScriptCleaner = () => void;

export class Script extends Actionable<object> {
    /**@internal */
    static getCtx({gameState}: { gameState: GameState }): ScriptCtx {
        return {
            gameState,
            game: gameState.game,
            liveGame: gameState.game.getLiveGame(),
            storable: gameState.game.getLiveGame().getStorable(),
        };
    }

    /**@internal */
    readonly handler: ScriptRun;

    constructor(handler: ScriptRun) {
        super();
        this.handler = handler;
        return this.chain() satisfies Proxied<Script, Chained<LogicAction.Actions>>;
    }

    /**@internal */
    execute({gameState}: { gameState: GameState }): void {
        this.handler(Script.getCtx({
            gameState
        }));
    }

    /**@internal */
    override fromChained(chained: Proxied<Script, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return [
            new ScriptAction(
                this.chain(),
                ScriptAction.ActionTypes.action,
                new ContentNode<Script>().setContent(chained)
            )
        ];
    }
}

