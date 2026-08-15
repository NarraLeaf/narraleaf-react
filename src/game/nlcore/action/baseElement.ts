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

    /**
     * Whether anything may have written to this element since it was last returned to its authored
     * state.
     *
     * A save carries only the elements that differ from what the script wrote, and finding those by
     * serialising all of them costs a walk of the whole story on every line. The flag narrows that
     * walk to the elements worth looking at.
     *
     * It is deliberately a *conservative over-approximation*: it is set when an action runs against
     * this element, whether or not the action wrote anything. A flag left standing after the state
     * went back to normal costs one comparison, because what decides whether an element reaches the
     * save is that comparison against its authored state, never the flag. The one failure that
     * matters is the opposite - state written without the flag being set - which is what
     * {@link Story.findUnmarkedElements} exists to catch.
     * @internal
     */
    private _dirty: boolean = false;

    /**@internal */
    markDirty(): this {
        this._dirty = true;
        return this;
    }

    /**@internal */
    isDirty(): boolean {
        return this._dirty;
    }

    /**
     * Return the element to the state its constructor config describes.
     *
     * Overriding this is how an element joins the lifecycle {@link LiveGame.newGame},
     * {@link LiveGame.deserialize} and leaving a scene all run. An override must call
     * `super.reset()`, which clears the dirty flag - an element back at its authored state has
     * nothing for a save to carry.
     * @internal
     */
    reset() {
        this._dirty = false;
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
