import {Actionable} from "@core/action/actionable";
import {Legacy_EventfulDisplayable} from "@core/types";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {EventDispatcher, Values} from "@lib/util/data";
import {ITransition} from "@core/elements/transition/type";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {ContentNode} from "@core/action/tree/actionTree";

/**@internal */
export type DisplayableEventTypes = {
    "event:displayable.applyTransition": [ITransition];
    "event:displayable.applyTransform": [Transform];
    "event:displayable.init": [];
};

/**@internal */
export abstract class Displayable<
    StateData extends Record<string, any>,
    Self extends Actionable
>
    extends Actionable<StateData, Self>
    implements Legacy_EventfulDisplayable {
    /**@internal */
    static EventTypes: { [K in keyof DisplayableEventTypes]: K } = {
        "event:displayable.applyTransition": "event:displayable.applyTransition",
        "event:displayable.applyTransform": "event:displayable.applyTransform",
        "event:displayable.init": "event:displayable.init",
    };
    /**@internal */
    readonly abstract events: EventDispatcher<DisplayableEventTypes>;

    abstract toDisplayableTransform(): Transform;
    abstract transformState: TransformState<any>;

    /**
     * Move the layer up
     * @chainable
     */
    public layerMoveUp(): Proxied<Self, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        return this.chain(this.constructLayerAction(chain, DisplayableActionTypes.layerMoveUp));
    }

    /**
     * Move the layer down
     * @chainable
     */
    public layerMoveDown(): Proxied<Self, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        return this.chain(this.constructLayerAction(chain, DisplayableActionTypes.layerMoveDown));
    }

    /**
     * Move the layer to the top
     * @chainable
     */
    public layerMoveTop(): Proxied<Self, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        return this.chain(this.constructLayerAction(chain, DisplayableActionTypes.layerMoveTop));
    }

    /**
     * Move the layer to the bottom
     * @chainable
     */
    public layerMoveBottom(): Proxied<Self, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        return this.chain(this.constructLayerAction(chain, DisplayableActionTypes.layerMoveBottom));
    }

    protected constructLayerAction<T extends Values<typeof DisplayableActionTypes>>(
        chain: Proxied<Self, Chained<LogicAction.Actions>>,
        type: T,
    ): DisplayableAction {
        return new DisplayableAction(
            chain,
            type,
            new ContentNode<DisplayableActionContentType[T]>(),
        );
    }
}
