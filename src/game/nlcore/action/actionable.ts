import {LogicAction} from "@core/action/logicAction";
import {Game} from "@core/game";
import {Chainable, Chained, Proxied} from "@core/action/chain";
import GameElement = LogicAction.GameElement;

export class Actionable<
    StateData extends Record<string, any> = Record<string, any>,
    Self extends Actionable = any
> extends Chainable<LogicAction.Actions, Self> {
    static IdPrefixes = {
        Actionable: "actionable",
        Condition: "$0",
        Control: "$1",
        Image: "$2",
        Script: "$3",
        Sound: "$4",
        Text: "$5",
        Menu: "$6",
    } as const;
    readonly id: string;

    constructor(idPrefix: string = Actionable.IdPrefixes.Actionable) {
        super();
        this.id = Game.getIdManager().prefix(idPrefix, Game.getIdManager().getStringId(), "-");
    }

    /**
     * @deprecated
     */
    toActions() {
        return [];
    }

    public toData(): StateData | null {
        return null;
    }

    public fromData(_: StateData): this {
        return this;
    }

    public fromChained(chained: Proxied<GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chained.getActions();
    }
}