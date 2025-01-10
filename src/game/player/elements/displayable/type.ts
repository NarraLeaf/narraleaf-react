import {ElementProp, ITransition} from "@core/elements/transition/type";
import React from "react";
import {Transform} from "@core/elements/transform/transform";
import {GameState} from "@player/gameState";
import {EventDispatcher} from "@lib/util/data";
import {Transition} from "@core/elements/transition/transition";

/**@internal */
export type DisplayableChildProps = {
    transition: ITransition | null;
    transform: Transform | null;
    transformProps: ElementProp<Element, React.HTMLAttributes<Element>>;
    transformRef: React.RefObject<HTMLDivElement | null>;
    state: GameState;
};
/**@internal */
export type DisplayableChildHandler = (props: Readonly<DisplayableChildProps>) => React.ReactElement;
/**@internal */
export type StatefulDisplayable = {
    state: Record<any, any>;
};
/**@inetrnal */
export type DisplayableAnimationEvents =
    | "event:displayable.applyTransform"
    | "event:displayable.applyTransition"
    | "event:displayable.init"
    | "event:displayable.onMount";
/**@internal */
export type EventfulDisplayableEvents<TransitionType extends Transition> = {
    [K in DisplayableAnimationEvents]:
    K extends "event:displayable.applyTransform" ? [transform: Transform, resolve: () => void] :
        K extends "event:displayable.applyTransition" ? [transition: TransitionType, resolve: () => void] :
            K extends "event:displayable.init" ? [resolve: () => void] :
                K extends "event:displayable.onMount" ? [] :
                    never;
}

/**@internal */
export interface EventfulDisplayable<T extends Transition> {
    /**@internal */
    events: EventDispatcher<EventfulDisplayableEvents<T>>;
}