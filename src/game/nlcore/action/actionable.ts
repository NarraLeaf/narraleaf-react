import {LogicAction} from "@core/action/logicAction";
import {Chainable, Chained, Proxied} from "@core/action/chain";
import GameElement = LogicAction.GameElement;

export class Actionable<
    StateData extends Record<string, any> | null = Record<string, any>,
    Self extends Actionable = any
> extends Chainable<LogicAction.Actions, Self> {
    constructor() {
        super();
    }

    /**@internal */
    public toData(): StateData | null {
        return null;
    }

    /**
     * @internal
     * override this method can override the default behavior of chaining
     *
     * When converting a chain to actions, this method is called to convert the chain to actions
     */
    public fromChained(chained: Proxied<GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chained.getActions();
    }
}