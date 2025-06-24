"use client";

import {
    PresenceContext,
    VariantLabels
} from "motion/react";
import * as React from "react";
import { useId, useMemo, useEffect } from "react";
import { useConstant } from "./utils";

interface PresenceChildProps {
    children: React.ReactElement
    isPresent: boolean
    onExitComplete?: () => void
    initial?: false | VariantLabels
    custom?: any
    presenceAffectsLayout: boolean
    mode: "sync" | "popLayout" | "wait"
    anchorX?: "left" | "right"
}

export const PresenceChild = ({
    children,
    initial,
    isPresent,
    onExitComplete,
    custom,
    presenceAffectsLayout,
    mode,
}: PresenceChildProps) => {
    const presenceChildren = useConstant(newChildrenMap);
    const id = useId();

    // Reset all children to false when isPresent changes
    useEffect(() => {
        presenceChildren.forEach((_, key) => presenceChildren.set(key, false));
    }, [isPresent, presenceChildren]);

    let isReusedContext = true;
    let context = useMemo((): any => {
        isReusedContext = false;
        return {
            id,
            initial,
            isPresent,
            custom,
            onExitComplete: (childId: string | number) => {
                presenceChildren.set(childId, true);

                for (const isComplete of presenceChildren.values()) {
                    if (!isComplete) return; // can stop searching when any is incomplete
                }

                if (onExitComplete) {
                    onExitComplete();
                }
            },
            register: (childId: string | number) => {
                presenceChildren.set(childId, false);
                return () => presenceChildren.delete(childId);
            },
        };
    }, [id, initial, isPresent, custom, presenceChildren, onExitComplete]);

    /**
     * If the presence of a child affects the layout of the components around it,
     * we want to make a new context value to ensure they get re-rendered
     * so they can detect that layout change.
     */
    if (presenceAffectsLayout && isReusedContext) {
        context = { ...context };
    }

    /**
     * If there's no `motion` components to fire exit animations, we want to remove this
     * component immediately.
     */
    useEffect(() => {
        if (!isPresent && !presenceChildren.size && onExitComplete) {
            onExitComplete();
        }
    }, [isPresent, presenceChildren.size, onExitComplete]);

    if (mode === "popLayout") {
        throw new Error("popLayout mode is not supported");
    }

    return (
        <PresenceContext.Provider value={context}>
            {children}
        </PresenceContext.Provider>
    );
};

function newChildrenMap(): Map<string | number, boolean> {
    return new Map();
}
