import type {Transform} from "@core/elements/transform/transform";
import type {TransformDefinitions} from "@core/elements/transform/type";

/**
 * The looping transform an element currently declares — what {@link Displayable.loop} sets and
 * {@link Displayable.stopLoop} clears.
 *
 * The binding lives on the element rather than on the running animation because it is the element,
 * not the animation, that a save and an undo can speak about: an animation that repeats forever has
 * no completion to anchor either one to. A host reads this on mount and after every settled
 * transform, and starts or stops the motion to match — so the binding, not the `motion` token, is
 * the truth about whether an element is looping.
 * @internal
 */
export type DisplayableLoopBinding = {
    transform: Transform;
    options: TransformDefinitions.LoopOptions;
};

export interface EventfulDisplayable {
    /**@internal */
    _getLoop(): DisplayableLoopBinding | null;
}

/**@internal */
export interface LoadableElement {
    isLoaded: () => boolean;
    waitForLoad: () => Promise<void>;
}

/**@internal */
export type DisplayableElementRef<T extends HTMLElement = HTMLElement> = T & LoadableElement;

/**@internal */
export type DisplayableRefGroup<T extends HTMLElement = HTMLElement> = [ref: React.RefObject<DisplayableElementRef<T> | null>, key: string];

/**@internal */
export type DisplayableRefGroups<T extends HTMLElement = HTMLElement> = React.RefObject<DisplayableRefGroup<T>[]>;