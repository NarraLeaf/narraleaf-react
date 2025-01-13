import {Transform} from "@core/elements/transform/transform";
import {EventDispatcher} from "@lib/util/data";
import {Transition} from "@core/elements/transition/transition";

/**@inetrnal */
export type DisplayableAnimationEvents =
    | "event:displayable.applyTransform"
    | "event:displayable.applyTransition"
    | "event:displayable.init"
    | "event:displayable.onMount"
    | "event:displayable.onFlush";
/**@internal */
export type EventfulDisplayableEvents<TransitionType extends Transition> = {
    [K in DisplayableAnimationEvents]:
    K extends "event:displayable.applyTransform" ? [transform: Transform, resolve: () => void] :
        K extends "event:displayable.applyTransition" ? [transition: TransitionType, resolve: () => void] :
            K extends "event:displayable.init" ? [resolve: () => void] :
                K extends "event:displayable.onMount" ? [] :
                    K extends "event:displayable.onFlush" ? [] :
                        never;
}

/**@internal */
export interface EventfulDisplayable<T extends Transition> {
    /**@internal */
    events: EventDispatcher<EventfulDisplayableEvents<T>>;
}