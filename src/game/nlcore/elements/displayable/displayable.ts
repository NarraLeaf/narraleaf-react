import {Actionable} from "@core/action/actionable";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {EventDispatcher, Values} from "@lib/util/data";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {Transition} from "@core/elements/transition/transition";
import {SrcManager} from "@core/action/srcManager";

/**@internal */
export type DisplayableEventTypes<TransitionType extends Transition> = {
    "event:displayable.applyTransition": [transition: TransitionType, resolve: () => void];
    "event:displayable.applyTransform": [transform: Transform, resolve: () => void];
    "event:displayable.init": [resolve: () => void];
    "event:displayable.onMount": [];
};

export abstract class Displayable<
    StateData extends Record<string, any>,
    Self extends Displayable<any, any, any, any>,
    TransformType extends TransformDefinitions.Types = TransformDefinitions.Types,
    TransitionType extends Transition = Transition,
>
    extends Actionable<StateData, Self>
    implements EventfulDisplayable<TransitionType> {
    /**@internal */
    static EventTypes: { [K in keyof DisplayableEventTypes<Transition>]: K } = {
        "event:displayable.applyTransition": "event:displayable.applyTransition",
        "event:displayable.applyTransform": "event:displayable.applyTransform",
        "event:displayable.init": "event:displayable.init",
        "event:displayable.onMount": "event:displayable.onMount",
    };

    /**@internal */
    readonly abstract events: EventDispatcher<DisplayableEventTypes<TransitionType>>;
    /**@internal */
    public readonly srcManager = new SrcManager();

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
        return this.transform(new Transform<TransformType>({
            position,
        } as TransformType, {
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
        return this.transform(new Transform<TransformType>({
            scale,
        } as TransformType, {
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
        return this.transform(new Transform<TransformType>({
            rotation,
        } as TransformType, {
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
        return this.transform(new Transform<TransformType>({
            opacity,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Apply a transform to the Displayable
     * @chainable
     */
    public transform(transform: Transform<TransformType>): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const chain: Proxied<Self, Chained<LogicAction.Actions, Self>> = this.chain();
        const action = new DisplayableAction<typeof DisplayableActionTypes.applyTransform, Self>(
            chain,
            DisplayableActionTypes.applyTransform,
            new ContentNode<DisplayableActionContentType["displayable:applyTransform"]>().setContent([
                transform.copy(),
            ])
        );
        return chain.chain(action);
    }

    /**
     * Show the Displayable
     *
     * if options are provided, the displayable will show with the provided transform options
     * @example
     * ```ts
     * text.show({
     *     duration: 1000,
     * });
     * ```
     * @chainable
     */
    public show(): Proxied<Text, Chained<LogicAction.Actions>>;

    public show(options: Transform<TransformType>): Proxied<Text, Chained<LogicAction.Actions>>;

    public show(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>>;

    public show(options?: Transform<TransformType> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const trans =
            (options instanceof Transform) ? options.copy() : new Transform<TransformType>({
                opacity: 1,
            } as TransformType, options || {});
        const action = new DisplayableAction<typeof DisplayableActionTypes.applyTransform, Self>(
            chain,
            DisplayableActionTypes.applyTransform,
            new ContentNode<DisplayableActionContentType["displayable:applyTransform"]>().setContent([
                trans
            ])
        );
        return chain.chain(action);
    }

    /**
     * Hide the Displayable
     *
     * if options are provided, the displayable will hide with the provided transform options
     * @example
     * ```ts
     * text.hide({
     *     duration: 1000,
     * });
     * ```
     * @chainable
     */
    public hide(): Proxied<Text, Chained<LogicAction.Actions>>;

    public hide(options: Transform<TransformType>): Proxied<Text, Chained<LogicAction.Actions>>;

    public hide(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>>;

    public hide(options?: Transform<TransformType> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Text, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const trans =
            (options instanceof Transform) ? options.copy() : new Transform<TransformType>({
                opacity: 0,
            } as TransformType, options || {});
        const action = new DisplayableAction<typeof DisplayableActionTypes.applyTransform, Self>(
            chain,
            DisplayableActionTypes.applyTransform,
            new ContentNode<DisplayableActionContentType["displayable:applyTransform"]>().setContent([
                trans,
            ])
        );
        return chain.chain(action);
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
