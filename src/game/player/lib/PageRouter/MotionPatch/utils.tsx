import { ReactNode, ReactElement, Children, isValidElement, useRef } from "react";

type Init<T> = () => T

/**
 * Creates a constant value over the lifecycle of a component.
 *
 * Even if `useMemo` is provided an empty array as its final argument, it doesn't offer
 * a guarantee that it won't re-run for performance reasons later on. By using `useConstant`
 * you can ensure that initialisers don't execute twice or more.
 */
export function useConstant<T>(init: Init<T>) {
    const ref = useRef<T | null>(null);

    if (ref.current === null) {
        ref.current = init();
    }

    return ref.current;
}

export type ComponentKey = string | number

export const getChildKey = (child: ReactElement<any>): ComponentKey =>
    child.key || "";

export function onlyElements(children: ReactNode): ReactElement<any>[] {
    const filtered: ReactElement<any>[] = [];

    // We use forEach here instead of map as map mutates the component key by preprending `.$`
    Children.forEach(children, (child) => {
        if (isValidElement(child)) filtered.push(child);
    });

    return filtered;
}

/**
 * Generate a unique key for a child element if it doesn't have one
 * This helps prevent issues with components that don't have explicit keys
 */
export function ensureChildKey(child: ReactElement<any>, index: number): ReactElement<any> {
    if (child.key != null) {
        return child;
    }
    
    // Generate a fallback key based on element type and index
    const fallbackKey = `${child.type?.toString() || "unknown"}-${index}`;
    
    if (process.env.NODE_ENV !== "production") {
        console.warn(
            `AnimatePresence child at index ${index} is missing a key. ` +
            "This can lead to unpredictable animation behavior. " +
            `Generated fallback key: ${fallbackKey}`
        );
    }
    
    return { ...child, key: fallbackKey };
}

/**
 * Safely get keys from children array with fallback generation
 */
export function getChildrenKeys(children: ReactElement<any>[]): ComponentKey[] {
    return children.map((child, index) => {
        const key = getChildKey(child);
        if (key === "" || key == null) {
            return `fallback-${child.type?.toString() || "unknown"}-${index}`;
        }
        return key;
    });
}

/**
 * Check if two arrays of children are deeply equal based on their keys and types
 */
export function areChildrenEqual(
    prev: ReactElement<any>[], 
    next: ReactElement<any>[]
): boolean {
    if (prev.length !== next.length) {
        return false;
    }
    
    for (let i = 0; i < prev.length; i++) {
        const prevChild = prev[i];
        const nextChild = next[i];
        
        if (
            getChildKey(prevChild) !== getChildKey(nextChild) ||
            prevChild.type !== nextChild.type
        ) {
            return false;
        }
    }
    
    return true;
}
