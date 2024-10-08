import {Game, LiveGame} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ScriptAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import {GameState} from "@player/gameState";
import {Chained, Proxied} from "@core/action/chain";
import type {Storable} from "@core/store/storable";

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
            gameState,
            game: gameState.game,
            liveGame: gameState.game.getLiveGame(),
            storable: gameState.game.getLiveGame().getStorable(),
        };
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

