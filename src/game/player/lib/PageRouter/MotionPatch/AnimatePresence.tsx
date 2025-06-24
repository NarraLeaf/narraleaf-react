/*
 * ============================================================================
 * THIRD PARTY SOFTWARE NOTICE AND LICENSE
 * ============================================================================
 * 
 * This file contains code originally derived from Framer Motion,
 * which is licensed under the MIT License.
 * 
 * Original work Copyright (c) 2018 Framer B.V.
 * Modified work Copyright (c) 2024 NarraLeaf Contributors
 * 
 * FRAMER MOTION LICENSE (MIT):
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 * MODIFICATIONS:
 * - Enhanced children difference detection for conditional rendering scenarios
 * - Improved exit animation handling for edge cases
 * - Added more reliable tracking of exiting children state
 * - Optimized animation completion detection
 * 
 * Original source: https://github.com/framer/motion
 * 
 * NOTICE: This modified version maintains compatibility with the original
 * Framer Motion API while providing enhanced functionality for specific
 * use cases in the NarraLeaf project.
 * ============================================================================
 */

"use client";

import * as React from "react";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConstant } from "./utils";
import { PresenceChild } from "./PresenceChild";
import { AnimatePresenceProps, usePresence, LayoutGroupContext } from "motion/react";
import { ComponentKey, getChildKey, onlyElements } from "./utils";

/**
 * Compare two arrays of children to detect actual changes
 * This is more reliable than simple reference comparison
 * Also handles conditional rendering cases where arrays might both be empty
 */
function hasChildrenChanged(
    prevChildren: React.ReactElement[], 
    nextChildren: React.ReactElement[]
): boolean {
    // Normal case: different lengths means change
    if (prevChildren.length !== nextChildren.length) {
        return true;
    }
    
    // If both are empty, no change
    if (prevChildren.length === 0 && nextChildren.length === 0) {
        return false;
    }
    
    const prevKeys = prevChildren.map(getChildKey);
    const nextKeys = nextChildren.map(getChildKey);
    
    // Check if keys are different
    for (let i = 0; i < prevKeys.length; i++) {
        if (prevKeys[i] !== nextKeys[i]) {
            return true;
        }
    }
    
    return false;
}

/**
 * Calculate which children are entering and exiting
 * Handles conditional rendering edge cases
 */
function calculateChildrenDiff(
    prevChildren: React.ReactElement[],
    nextChildren: React.ReactElement[],
    renderedChildren: React.ReactElement[]
) {
    const prevKeys = new Set(prevChildren.map(getChildKey));
    const nextKeys = new Set(nextChildren.map(getChildKey));
    const renderedKeys = new Set(renderedChildren.map(getChildKey));
    
    const exitingKeys = new Set<ComponentKey>();
    const enteringKeys = new Set<ComponentKey>();
    
    // Handle conditional rendering: if present children is empty but we have rendered children,
    // all rendered children should be marked as exiting
    if (nextChildren.length === 0 && renderedChildren.length > 0) {
        renderedKeys.forEach(key => exitingKeys.add(key));
    } else {
        // Normal case: find exiting children (in prev but not in next)
        prevKeys.forEach(key => {
            if (!nextKeys.has(key)) {
                exitingKeys.add(key);
            }
        });
    }
    
    // Find entering children (in next but not in prev and not currently rendered)
    nextKeys.forEach(key => {
        if (!prevKeys.has(key) && !renderedKeys.has(key)) {
            enteringKeys.add(key);
        }
    });
    
    return { exitingKeys, enteringKeys };
}

/**
 * `AnimatePresence` enables the animation of components that have been removed from the tree.
 *
 * When adding/removing more than a single child, every child **must** be given a unique `key` prop.
 *
 * Any `motion` components that have an `exit` property defined will animate out when removed from
 * the tree.
 *
 * ```jsx
 * import { motion, AnimatePresence } from 'framer-motion'
 *
 * export const Items = ({ items }) => (
 *   <AnimatePresence>
 *     {items.map(item => (
 *       <motion.div
 *         key={item.id}
 *         initial={{ opacity: 0 }}
 *         animate={{ opacity: 1 }}
 *         exit={{ opacity: 0 }}
 *       />
 *     ))}
 *   </AnimatePresence>
 * )
 * ```
 *
 * You can sequence exit animations throughout a tree using variants.
 *
 * If a child contains multiple `motion` components with `exit` props, it will only unmount the child
 * once all `motion` components have finished animating out. Likewise, any components using
 * `usePresence` all need to call `safeToRemove`.
 *
 * @public
 */
export const AnimatePresence = ({
    children,
    custom,
    initial = true,
    onExitComplete,
    presenceAffectsLayout = true,
    mode = "sync",
    propagate = false,
}: React.PropsWithChildren<AnimatePresenceProps>) => {
    const [isParentPresent, safeToRemove] = usePresence(propagate);

    /**
     * Filter any children that aren't ReactElements. We can only track components
     * between renders with a props.key.
     */
    const presentChildren = useMemo(() => onlyElements(children), [children]);

    /**
     * Track the keys of the currently rendered children. This is used to
     * determine which children are exiting.
     */
    const presentKeys =
        propagate && !isParentPresent ? [] : presentChildren.map(getChildKey);

    /**
     * If `initial={false}` we only want to pass this to components in the first render.
     */
    const isInitialRender = useRef(true);

    /**
     * A ref containing the currently present children. When all exit animations
     * are complete, we use this to re-render the component with the latest children
     * *committed* rather than the latest children *rendered*.
     */
    const pendingPresentChildren = useRef(presentChildren);

    /**
     * Track which exiting children have finished animating out.
     */
    const exitComplete = useConstant(() => new Map<ComponentKey, boolean>());

    /**
     * Save children to render as React state. To ensure this component is concurrent-safe,
     * we check for exiting children via an effect.
     */
    const [diffedChildren, setDiffedChildren] = useState(presentChildren);
    const [renderedChildren, setRenderedChildren] = useState(presentChildren);

    // Track exiting children separately for more reliable detection
    const [exitingChildren, setExitingChildren] = useState<React.ReactElement[]>([]);

    // Track if we need to handle conditional rendering case
    const hasConditionalRenderingChange = useRef(false);

    useLayoutEffect(() => {
        isInitialRender.current = false;
        pendingPresentChildren.current = presentChildren;

        // Handle conditional rendering: if present children becomes empty but we have rendered children,
        // mark those children as exiting
        if (presentChildren.length === 0 && renderedChildren.length > 0 && diffedChildren.length > 0) {
            hasConditionalRenderingChange.current = true;
            
            // Find children that should exit due to conditional rendering
            const shouldExitChildren = renderedChildren.filter(child => {
                const key = getChildKey(child);
                return exitComplete.get(key) !== true;
            });
            
            if (shouldExitChildren.length > 0) {
                // Mark these children as exiting in the exitComplete map
                shouldExitChildren.forEach(child => {
                    const key = getChildKey(child);
                    if (!exitComplete.has(key)) {
                        exitComplete.set(key, false);
                    }
                });
                
                setExitingChildren(prev => {
                    const existingKeys = new Set(prev.map(getChildKey));
                    const newExiting = shouldExitChildren.filter(child => 
                        !existingKeys.has(getChildKey(child))
                    );
                    return [...prev, ...newExiting];
                });
            }
        } else if (presentChildren.length > 0 || renderedChildren.length === 0) {
            // Reset flag when we have present children again or no rendered children
            hasConditionalRenderingChange.current = false;
        }

        /**
         * Update complete status of exiting children.
         */
        for (let i = 0; i < renderedChildren.length; i++) {
            const key = getChildKey(renderedChildren[i]);

            if (!presentKeys.includes(key)) {
                if (exitComplete.get(key) !== true) {
                    exitComplete.set(key, false);
                }
            } else {
                exitComplete.delete(key);
            }
        }
    }, [renderedChildren, presentKeys.length, presentKeys.join("-"), presentChildren.length]);

    // Use more reliable diff detection
    const childrenChanged = useMemo(() => {
        return hasChildrenChanged(diffedChildren, presentChildren);
    }, [diffedChildren, presentChildren]);

    if (childrenChanged || hasConditionalRenderingChange.current) {
        let nextChildren: React.ReactElement[] = [];
        
        if (hasConditionalRenderingChange.current) {
            // Handle conditional rendering case specially
            if (mode === "wait" && exitingChildren.length > 0) {
                // In wait mode, only render exiting children until they're done
                nextChildren = exitingChildren;
            } else {
                // In sync mode, render present children + exiting children
                // But since present children is empty in conditional rendering case,
                // we only render the exiting children
                nextChildren = [...presentChildren, ...exitingChildren];
            }
        } else {
            // Normal children change case
            const { exitingKeys } = calculateChildrenDiff(diffedChildren, presentChildren, renderedChildren);
            
            // Find actual exiting children elements
            const newExitingChildren = diffedChildren.filter(child => 
                exitingKeys.has(getChildKey(child))
            );
            
            if (mode === "wait" && newExitingChildren.length > 0) {
                // In wait mode, only render exiting children until they're done
                nextChildren = newExitingChildren;
            } else {
                // Merge present children with still-exiting children
                const presentChildrenMap = new Map(
                    presentChildren.map(child => [getChildKey(child), child])
                );
                
                // Keep previously exiting children that are still animating out
                const stillExitingChildren = exitingChildren.filter(child => {
                    const key = getChildKey(child);
                    return exitComplete.get(key) === false && !presentChildrenMap.has(key);
                });
                
                // Add newly exiting children that aren't already in the exiting list
                const newlyExitingChildren = newExitingChildren.filter(child => {
                    const key = getChildKey(child);
                    return !exitingChildren.some(existing => getChildKey(existing) === key);
                });
                
                // Combine all exiting children
                const allExitingChildren = [...stillExitingChildren, ...newlyExitingChildren];
                
                // Maintain order: present children first, then exiting children
                nextChildren = [...presentChildren, ...allExitingChildren];
            }
            
            // Update exiting children state for normal case
            setExitingChildren(newExitingChildren);
        }

        setRenderedChildren(onlyElements(nextChildren));
        setDiffedChildren(presentChildren);

        /**
         * Early return to ensure once we've set state with the latest diffed
         * children, we can immediately re-render.
         */
        return null;
    }

    if (
        process.env.NODE_ENV !== "production" &&
        mode === "wait" &&
        renderedChildren.length > 1
    ) {
        console.warn(
            "You're attempting to animate multiple children within AnimatePresence, but its mode is set to \"wait\". This will lead to odd visual behaviour."
        );
    }

    /**
     * If we've been provided a forceRender function by the LayoutGroupContext,
     * we can use it to force a re-render amongst all surrounding components once
     * all components have finished animating out.
     */
    const { forceRender } = useContext(LayoutGroupContext);

    return (
        <>
            {renderedChildren.map((child) => {
                const key = getChildKey(child);

                // Enhanced presence detection that handles conditional rendering
                let isPresent: boolean;
                
                if (propagate && !isParentPresent) {
                    isPresent = false;
                } else if (hasConditionalRenderingChange.current) {
                    // In conditional rendering case, check if this child is in exitingChildren
                    const isExiting = exitingChildren.some(exitingChild => getChildKey(exitingChild) === key);
                    isPresent = !isExiting && presentKeys.includes(key);
                } else {
                    // Normal case
                    isPresent = presentChildren === renderedChildren || presentKeys.includes(key);
                }

                const onExit = () => {
                    if (exitComplete.has(key)) {
                        exitComplete.set(key, true);
                    } else {
                        return;
                    }

                    let isEveryExitComplete = true;
                    exitComplete.forEach((isExitComplete) => {
                        if (!isExitComplete) isEveryExitComplete = false;
                    });

                    if (isEveryExitComplete) {
                        forceRender?.();
                        setRenderedChildren(pendingPresentChildren.current);
                        setExitingChildren([]); // Clear exiting children when all exits are complete
                        
                        // Reset conditional rendering flag when all exits are complete
                        hasConditionalRenderingChange.current = false;

                        if (propagate) {
                            safeToRemove?.();
                        }

                        if (onExitComplete) {
                            onExitComplete();
                        }
                    }
                };

                return (
                    <PresenceChild
                        key={key}
                        isPresent={isPresent}
                        initial={
                            !isInitialRender.current || initial
                                ? undefined
                                : false
                        }
                        custom={custom}
                        presenceAffectsLayout={presenceAffectsLayout}
                        mode={mode}
                        onExitComplete={isPresent ? undefined : onExit}
                    >
                        {child}
                    </PresenceChild>
                );
            })}
        </>
    );
};
