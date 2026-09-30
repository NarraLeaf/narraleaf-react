import React, { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Layout rounds to fractional pixels, so a line that fills its box exactly must still count as fitting. */
const FIT_TOLERANCE_PX = 0.5;

/** Stop bisecting once the remaining window is finer than the eye can tell. */
const SEARCH_PRECISION = 0.005;

/** The window halves every step, so this bound is never reached in practice. */
const MAX_SEARCH_STEPS = 12;

/** Below this the line is unreadable, so a floor smaller than the box can honour stops here. */
const MIN_SEARCH_SCALE = 0.05;

/** Smallest size text scaling sets when the line does not say otherwise. */
export const DEFAULT_AUTO_FIT_MIN_FONT_SIZE = 12;

/**
 * The multiplier every size in the line is written against.
 *
 * One custom property drives the container and every word inside it, so a candidate size is one
 * write rather than a walk over the elements, and a word that carries a size of its own keeps its
 * weight against the rest of the line at every scale.
 */
export const AUTO_FIT_SCALE_VAR = "--nl-text-scale";
export const AUTO_FIT_SCALE_MULTIPLIER = `var(${AUTO_FIT_SCALE_VAR}, 1)`;

/** The same length, scaled by the line's current multiplier, whatever unit it was written in. */
export function scaledFontSize(value: React.CSSProperties["fontSize"]): React.CSSProperties["fontSize"] {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const length = typeof value === "number" ? `${value}px` : String(value);
    return `calc(${length} * ${AUTO_FIT_SCALE_MULTIPLIER})`;
}

/** What the line is set at when it inherits its size: the inherited size, scaled. */
export function inheritedScaledFontSize(): React.CSSProperties["fontSize"] {
    return `calc(1em * ${AUTO_FIT_SCALE_MULTIPLIER})`;
}

function contentBlockSize(box: HTMLElement, vertical: boolean): number {
    const style = getComputedStyle(box);
    if (vertical) {
        return box.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
    }
    return box.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0");
}

export type AutoFitOptions = {
    enabled: boolean;
    /** The floor, in px. A line that overflows at this size is left overflowing rather than set smaller. */
    minFontSize: number;
    /** Vertical writing swaps the axes: the columns advance across the box, not down it. */
    vertical: boolean;
    /**
     * What has been typed so far. The line is measured again every time this changes, which is what
     * makes the size follow the text rather than a guess made before it existed.
     */
    revealed: number;
};

export type AutoFitState = {
    containerRef: React.MutableRefObject<HTMLDivElement | null>;
    /** The share of the authored size the line is currently set at. */
    scale: number;
};

/**
 * Keeps a line inside its box while it is being typed.
 *
 * The line is set at the size it was written at and stays there for as long as it fits, so a short
 * line is never set small "just in case". The moment the text reaches the bottom of the box, the
 * next character brings the size down by whatever it takes to fit, and every character after it is
 * measured again. So the size follows what is actually on screen: a run of larger or smaller words
 * inside the line is accounted for by having been rendered, not by being predicted.
 *
 * Within one line the size only ever comes down, since the text only ever grows. A change in the
 * size of the box starts the line over at its authored size.
 *
 * The box is the container's parent, which is the element the host sized. A parent with no height
 * of its own leaves the line at its authored size.
 */
export function useAutoFitScale({ enabled, minFontSize, vertical, revealed }: AutoFitOptions): AutoFitState {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const scaleRef = useRef(1);
    const measuredBoxRef = useRef(0);
    scaleRef.current = scale;

    const measure = useCallback(
        (fromScale: number) => {
            const container = containerRef.current;
            const box = container?.parentElement;
            if (!container || !box) {
                return;
            }
            const available = contentBlockSize(box, vertical);
            if (!Number.isFinite(available) || available <= 0) {
                return;
            }
            measuredBoxRef.current = available;

            const used = () => (vertical ? container.offsetWidth : container.offsetHeight);
            const apply = (candidate: number) => {
                container.style.setProperty(AUTO_FIT_SCALE_VAR, String(candidate));
            };
            const fitsAt = (candidate: number): boolean => {
                apply(candidate);
                return used() <= available + FIT_TOLERANCE_PX;
            };

            if (fitsAt(fromScale)) {
                if (fromScale !== scaleRef.current) {
                    setScale(fromScale);
                }
                return;
            }

            // The size the line was written at, read back off the element so any unit works.
            apply(1);
            const basePx = parseFloat(getComputedStyle(container).fontSize) || 0;
            const floor = basePx > 0 ? Math.min(1, Math.max(MIN_SEARCH_SCALE, minFontSize / basePx)) : MIN_SEARCH_SCALE;

            let result: number;
            if (floor >= fromScale || !fitsAt(floor)) {
                result = floor;
            } else {
                let low = floor;
                let high = fromScale;
                for (let step = 0; step < MAX_SEARCH_STEPS && high - low > SEARCH_PRECISION; step++) {
                    const middle = (low + high) / 2;
                    if (fitsAt(middle)) {
                        low = middle;
                    } else {
                        high = middle;
                    }
                }
                result = low;
            }

            apply(result);
            setScale(result);
        },
        [minFontSize, vertical]
    );

    useLayoutEffect(() => {
        if (!enabled) {
            if (scaleRef.current !== 1) {
                setScale(1);
            }
            return undefined;
        }
        // Each character is measured against the size the line is already at: it only ever needs to
        // come down from there, and starting the search at 1 would let a settled line jump back up.
        measure(scaleRef.current);
        return undefined;
    }, [enabled, measure, revealed]);

    useLayoutEffect(() => {
        const box = containerRef.current?.parentElement;
        if (!enabled || !box || typeof ResizeObserver === "undefined") {
            return undefined;
        }
        // A box that changed size is a different question, so the line starts over at the size it
        // was written at rather than staying at whatever the old box forced.
        const observer = new ResizeObserver(() => {
            if (Math.abs(contentBlockSize(box, vertical) - measuredBoxRef.current) > FIT_TOLERANCE_PX) {
                measure(1);
            }
        });
        observer.observe(box);
        let cancelled = false;
        void document.fonts?.ready.then(() => {
            if (!cancelled) {
                measure(scaleRef.current);
            }
        });
        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, [enabled, measure, vertical]);

    return { containerRef, scale };
}
