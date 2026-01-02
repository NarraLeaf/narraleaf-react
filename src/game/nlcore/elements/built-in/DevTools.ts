import { ControlAction } from "../../action/actions/controlAction";
import { Chained, Proxied } from "../../action/chain";
import { LogicAction } from "../../game";
import { Control } from "../control";


export class DevTools {
    public static getActionId(action: LogicAction.Actions): string {
        return action.getId();
    }

    public static setActionId(action: LogicAction.Actions, id: string): LogicAction.Actions {
        action.setId(id);
        return action;
    }

    public static chainToActions(chain: Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chain.getActions();
    }

    public static wrapAction(action: LogicAction.Actions[] | Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>): ControlAction {
        const actions = Chained.isChained(action) ? action.getActions() : action;
        return Control.do(actions);
    }
}
