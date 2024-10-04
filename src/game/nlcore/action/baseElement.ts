import {ElementStateRaw} from "@core/elements/story";
import {LogicAction} from "@core/action/logicAction";

export class BaseElement {
    /**@internal */
    protected id: string = "";

    /**@internal */
    setId(id: string) {
        this.id = id;
    }

    /**@internal */
    getId() {
        return this.id;
    }

    /**@internal */
    reset() {
    }

    /**@internal */
    fromData(_: ElementStateRaw) {
        return this;
    }

    /**@internal */
    protected construct(actions: LogicAction.Actions[]): LogicAction.Actions[] {
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            if (i !== 0) {
                actions[i - 1]?.contentNode.setInitChild(action.contentNode);
            }
        }
        return actions;
    }
}

