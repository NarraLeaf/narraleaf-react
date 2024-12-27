import {ElementProp, ITransition} from "@core/elements/transition/type";
import React from "react";
import {Transform} from "@core/elements/transform/transform";
import {GameState} from "@player/gameState";

/**@internal */
export type DisplayableChildProps = {
    transition: ITransition | null;
    transform: Transform | null;
    transformProps: ElementProp<Element, React.HTMLAttributes<Element>>;
    transformRef: React.MutableRefObject<HTMLDivElement | null>;
    state: GameState;
};
/**@internal */
export type DisplayableChildHandler = (props: Readonly<DisplayableChildProps>) => React.ReactElement;
/**@internal */
export type StatefulDisplayable = {
    state: Record<any, any>;
};
