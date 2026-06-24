import { ControlAction } from "../../action/actions/controlAction";
import { Chained, Proxied } from "../../action/chain";
import { GameState } from "../../common/game";
import { LogicAction } from "../../game";
import { Control } from "../control";
import { DynamicPersistent, Persistent } from "../persistent";
import { Scene } from "../scene";


export class DevTools {
    public static getActionId(action: LogicAction.Actions): string {
        return action.getId();
    }

    public static setActionId(action: LogicAction.Actions, id: string): LogicAction.Actions {
        action.setId(id);
        return action;
    }

    public static getStaticId(action: LogicAction.Actions): string | null {
        return action.getStaticId();
    }

    public static setStaticId(action: LogicAction.Actions, id: string | null): LogicAction.Actions {
        action.setStaticId(id);
        return action;
    }

    public static chainToActions(chain: Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chain.getActions();
    }

    public static wrapAction(action: LogicAction.Actions[] | Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>): ControlAction {
        const actions = Chained.isChained(action) ? action.getActions() : action;
        return Control.do(actions);
    }

    public static getNamespaceName(persistent: Persistent<any>): string {
        return persistent.getNamespaceName();
    }

    public static getCurrentScene(gameState: GameState): Scene | null {
        return gameState.getCurrentScene();
    }

    public static DynamicPersistent = DynamicPersistent;
}
