import React, { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Layout rounds to fractional pixels, so a line that fills its box exactly must still count as fitting. */
const FIT_TOLERANCE_PX = 0.5;

/** Stop bisecting once the remaining window is finer than the eye can tell. */
const SEARCH_PRECISION = 0.005;

/** The window halves every step, so this bound is never reached in practice. */
const MAX_SEARCH_STEPS = 12;

/** Below this the line is unreadable, so a floor smaller than the box can honour stops here. */
const MIN_SEARCH_SCALE = 0.05;

/** Smallest size auto fit sets when the line does not say otherwise. */
export const DEFAULT_AUTO_FIT_MIN_FONT_SIZE = 12;

/** Set on the measuring copy so every explicit word size scales with one write. */
export const AUTO_FIT_SCALE_VAR = "--nl-auto-fit-scale";

/**
 * The same length, scaled, whatever unit it was written in.
 *
 * The multiplier is a number for the line on screen and the scale custom property for the copy
 * being measured, where one write has to resize every word at once.
 */
export function scaledFontSize(
    value: React.CSSProperties["fontSize"],
    scale: number | string
): React.CSSProperties["fontSize"] {
    if (scale === 1) {
        return value;
    }
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const length = typeof value === "number" ? `${value}px` : String(value);
    return `calc(${length} * ${scale})`;
}

/** The multiplier the measuring copy scales by, readable from every word inside it. */
export const AUTO_FIT_SCALE_MULTIPLIER = `var(${AUTO_FIT_SCALE_VAR}, 1)`;

/** What the line is set at when it inherits its size: a share of the size it inherits. */
export function inheritedScaledFontSize(scale: number): React.CSSProperties["fontSize"] | undefined {
    return scale === 1 ? undefined : `${scale * 100}%`;
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
    /** Everything that changes the laid-out result without changing the box. */
    signature: string;
};

export type AutoFitState = {
    containerRef: React.MutableRefObject<HTMLDivElement | null>;
    mirrorRef: React.MutableRefObject<HTMLDivElement | null>;
    /** The share of the authored size the line is set at. */
    scale: number;
};

/**
 * Finds the largest size at which a whole line still fits the box it is placed in.
 *
 * The line being typed is not what has to fit - the finished line is - so the search runs against a
 * hidden copy holding every word, laid out under the same box, the same typeface and the same
 * wrapping rules. The copy is what the bisection resizes; the visible line is set once, when the
 * answer is known, and stays there for the rest of the line.
 *
 * The box is the container's parent: a dialog box has a size of its own, and the line is what has
 * to live inside it. A parent with no height of its own leaves the scale at 1.
 */
export function useAutoFitScale({ enabled, minFontSize, vertical, signature }: AutoFitOptions): AutoFitState {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const scaleRef = useRef(1);
    const measuredBoxRef = useRef(0);
    scaleRef.current = scale;

    const measure = useCallback(() => {
        const container = containerRef.current;
        const mirror = mirrorRef.current;
        const box = container?.parentElement;
        if (!container || !mirror || !box) {
            return;
        }
        const available = contentBlockSize(box, vertical);
        if (!Number.isFinite(available) || available <= 0) {
            return;
        }
        measuredBoxRef.current = available;
        // The container is already carrying whatever scale the last measurement settled on, so the
        // size it was authored at is read back out of it rather than guessed.
        const rendered = parseFloat(getComputedStyle(container).fontSize) || 0;
        const basePx = rendered / (scaleRef.current || 1);
        if (basePx <= 0) {
            return;
        }
        const floor = Math.min(1, Math.max(MIN_SEARCH_SCALE, minFontSize / basePx));
        const fitsAt = (candidate: number): boolean => {
            mirror.style.fontSize = `${basePx * candidate}px`;
            mirror.style.setProperty(AUTO_FIT_SCALE_VAR, String(candidate));
            const used = vertical ? mirror.offsetWidth : mirror.offsetHeight;
            return used <= available + FIT_TOLERANCE_PX;
        };

        let result: number;
        if (fitsAt(1)) {
            result = 1;
        } else if (floor >= 1 || !fitsAt(floor)) {
            result = floor;
        } else {
            let low = floor;
            let high = 1;
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
        setScale(previous => (Math.abs(previous - result) < 0.001 ? previous : result));
    }, [minFontSize, vertical]);

    useLayoutEffect(() => {
        if (!enabled) {
            setScale(1);
            return undefined;
        }
        measure();
        const box = containerRef.current?.parentElement;
        if (!box) {
            return undefined;
        }
        // Only a box that actually changed size asks for a new answer: a box that sizes itself to
        // its content changes every time the line is set, and re-measuring on that would chase itself.
        const observer =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(() => {
                      if (Math.abs(contentBlockSize(box, vertical) - measuredBoxRef.current) > FIT_TOLERANCE_PX) {
                          measure();
                      }
                  });
        observer?.observe(box);
        let cancelled = false;
        void document.fonts?.ready.then(() => {
            if (!cancelled) {
                measure();
            }
        });
        return () => {
            cancelled = true;
            observer?.disconnect();
        };
    }, [enabled, measure, signature, vertical]);

    return { containerRef, mirrorRef, scale };
}
