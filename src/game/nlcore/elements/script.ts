import {Game} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Actionable} from "@core/action/actionable";
import {GameState} from "@player/gameState";
import {Chained, Proxied} from "@core/action/chain";
import type {Namespace, Storable} from "@core/elements/persistent/storable";
import {ScriptAction} from "@core/action/actions/scriptAction";
import {LiveGame} from "@core/game/liveGame";
import { NameSpaceContent } from "./persistent/type";

export type NamespaceGetter = <T extends NameSpaceContent<keyof T>>(namespace: string) => Namespace<T>;

export interface ScriptCtx {
    gameState: GameState;
    game: Game;
    liveGame: LiveGame;
    storable: Storable;
    $: NamespaceGetter;
}

type ScriptRun = (ctx: ScriptCtx) => ScriptCleaner | void;
/**@internal */
export type ScriptCleaner = () => void;

export class Script extends Actionable<object> {
    /**@internal */
    static getCtx({gameState}: { gameState: GameState }): ScriptCtx {
        const liveGame = gameState.game.getLiveGame();
        const storable = liveGame.getStorable();
        return {
            gameState,
            game: gameState.game,
            liveGame,
            storable,
            $: (namespace: string) => storable.getNamespace(namespace),
        };
    }

    public static execute(handler: ScriptRun): Proxied<Script, Chained<LogicAction.Actions>> {
        return new Script(handler) as Proxied<Script, Chained<LogicAction.Actions>>;
    }

    /**@internal */
    readonly handler: ScriptRun;

    constructor(handler: ScriptRun) {
        super();
        this.handler = handler;
        
        const chain = this.chain();
        const action = new ScriptAction(
            chain,
            ScriptAction.ActionTypes.action,
            new ContentNode<Script>().setContent(this)
        );
        return this.chain(action) satisfies Proxied<Script, Chained<LogicAction.Actions>>;
    }

    /**@internal */
    execute({gameState}: { gameState: GameState }): ScriptCleaner | void {
        return this.handler(Script.getCtx({
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

