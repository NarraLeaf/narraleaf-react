import {ElementProp, ITransition} from "@core/elements/transition/type";
import React from "react";
import {Transform} from "@core/elements/transform/transform";
import {GameState} from "@player/gameState";
import {EventDispatcher} from "@lib/util/data";

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
    | "event:displayable.init";
/**@internal */
export type EventfulDisplayableEvents = {
    [K in DisplayableAnimationEvents]:
    K extends "event:displayable.applyTransform" ? [Transform] :
        K extends "event:displayable.applyTransition" ? [ITransition] :
            K extends "event:displayable.init" ? [] :
                never;
}

/**@internal */
export interface EventfulDisplayable {
    /**@internal */
    events: EventDispatcher<EventfulDisplayableEvents>;
}