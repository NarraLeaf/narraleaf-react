import {LogicAction} from "@core/action/logicAction";
import {Chainable, Chained, Proxied} from "@core/action/chain";
import GameElement = LogicAction.GameElement;

export class Actionable<
    StateData extends Record<string, any> = Record<string, any>,
    Self extends Actionable = any
> extends Chainable<LogicAction.Actions, Self> {
    constructor() {
        super();
    }

    /**@internal */
    public toData(): StateData | null {
        return null;
    }

    /**@internal */
    public fromChained(chained: Proxied<GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chained.getActions();
    }
}