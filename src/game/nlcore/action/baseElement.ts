import type {ElementStateRaw} from "@core/elements/story";
import type {LogicAction} from "@core/action/logicAction";

export class BaseElement {
    /**@internal */
    protected id: string = "";

    /**
     * An id given by whoever built this element, kept in preference to the generated one.
     *
     * Generated element ids are positions in a breadth-first walk of the action tree, so they say
     * where an element sat rather than which element it is: writing one line ahead of it hands its
     * id to a different element, and a save restoring by that id then applies one element's state to
     * another - silently, because the id it names still exists. A host that can name its elements
     * from its own documents sets this, and then an edit somewhere else cannot move them.
     *
     * Mirrors {@link Action}'s static id, deliberately: the two are the same problem, and actions
     * solved it first.
     * @internal
     */
    private _staticId: string | null = null;

    /**@internal */
    setId(id: string) {
        this.id = id;
    }

    /**@internal */
    getId() {
        return this.id;
    }

    /**@internal */
    getStaticId(): string | null {
        return this._staticId;
    }

    /**@internal */
    setStaticId(id: string | null): this {
        this._staticId = id;
        return this;
    }

    /**
     * Take the generated id only when nothing named this element.
     * @internal
     */
    resolveId(generatedId: string): this {
        this.setId(this._staticId || generatedId);
        return this;
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
                actions[i - 1]?.contentNode.setChild(action.contentNode);
            }
        }
        return actions;
    }
}
