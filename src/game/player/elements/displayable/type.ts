/**@internal */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventfulDisplayable {
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