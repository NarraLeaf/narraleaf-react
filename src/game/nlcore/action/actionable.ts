import {LogicAction} from "@core/action/logicAction";
import {Game} from "@core/game";

export class Actionable<
    StateData extends Record<string, any> = Record<string, any>
> {
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
    protected actions: LogicAction.Actions[] = [];

    constructor(idPrefix: string = Actionable.IdPrefixes.Actionable) {
        this.id = Game.getIdManager().prefix(idPrefix, Game.getIdManager().getStringId(), "-");
    }

    toActions() {
        let actions = this.actions;
        this.actions = [];
        return actions;
    }

    public toData(): StateData | null {
        return null;
    }

    public fromData(_: StateData): this {
        return this;
    }
}