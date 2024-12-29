import {Actionable} from "@core/action/actionable";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {EventDispatcher, Values} from "@lib/util/data";
import {ITransition} from "@core/elements/transition/type";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import type {TransformDefinitions} from "@core/elements/transform/type";

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
    implements EventfulDisplayable {
    /**@internal */
    static EventTypes: { [K in keyof DisplayableEventTypes]: K } = {
        "event:displayable.applyTransition": "event:displayable.applyTransition",
        "event:displayable.applyTransform": "event:displayable.applyTransform",
        "event:displayable.init": "event:displayable.init",
    };

    /**@internal */
    readonly abstract events: EventDispatcher<DisplayableEventTypes>;

    abstract transformState: TransformState<any>;

    abstract transform(transform: Transform): Proxied<any, LogicAction.Actions>;

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

    /**
     * Set Image Position
     *
     * @param position - The position of the image, expected {@link RawPosition} or {@link IPosition}
     * @param duration - The duration of the position animation
     * @param easing - The easing of the position animation
     * @chainable
     */
    public pos(
        position: TransformDefinitions.ImageTransformProps["position"],
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformDefinitions.Types>({
            position,
        }, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set Image Scale
     * @param scale - The scale of the image, between 0 and 1
     * @param duration - The duration of the scale animation
     * @param easing - The easing of the scale animation
     * @chainable
     */
    public scale(
        scale: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformDefinitions.Types>({
            scale,
        }, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set Image Rotation
     * @param rotation - The rotation of the image, in degrees
     * @param duration - The duration of the rotation animation
     * @param easing - The easing of the rotation animation
     * @chainable
     */
    public rotate(
        rotation: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformDefinitions.Types>({
            rotation,
        }, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set Image Opacity
     * @param opacity - The opacity of the image, between 0 and 1
     * @param duration - The duration of the opacity animation
     * @param easing - The easing of the opacity animation
     * @chainable
     */
    public opacity(
        opacity: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformDefinitions.Types>({
            opacity,
        }, {
            duration,
            ease: easing,
        }));
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
