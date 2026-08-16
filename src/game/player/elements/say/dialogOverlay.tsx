import React from "react";
import { createPortal } from "react-dom";

/**
 * A rectangle in the overlay's own coordinates — the dialog box drawn at its authored size, before
 * the stage scales it to the window.
 */
export type DialogOverlayRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

export type DialogOverlay = {
    /**
     * Renders its children above the dialog, still inside the scaled stage, so a popup keeps the
     * dialog's own scale and is not clipped by the text box it belongs to.
     */
    Portal: React.FC<{ children?: React.ReactNode }>;
    /**
     * Where an element sits in the overlay's coordinates. Feed the result straight to `left`/`top`
     * on a child of {@link DialogOverlay.Portal}.
     */
    measure: (element: Element | null) => DialogOverlayRect | null;
    /** The overlay element, or `null` outside a dialog. */
    container: HTMLElement | null;
};

/**@internal */
export const DialogOverlayContext = React.createContext<HTMLElement | null>(null);

const emptyOverlay: DialogOverlay = {
    Portal: () => null,
    measure: () => null,
    container: null,
};

/**
 * Somewhere to draw things that belong to a line but must not live inside it — the definition popup
 * of an inline glossary word, a tooltip on a name.
 *
 * The overlay covers the dialog and sits above it, inside the same scaled stage, so a popup is
 * drawn at the dialog's own scale and escapes the text box's clipping. It lets clicks through
 * everywhere its children do not paint; give the popup itself `pointer-events: auto`.
 *
 * @example
 * ```tsx
 * const overlay = useDialogOverlay();
 * const rect = overlay.measure(anchorRef.current);
 *
 * return rect && (
 *     <overlay.Portal>
 *         <div style={{position: "absolute", left: rect.left, top: rect.top, pointerEvents: "auto"}}>
 *             …
 *         </div>
 *     </overlay.Portal>
 * );
 * ```
 */
export function useDialogOverlay(): DialogOverlay {
    const container = React.useContext(DialogOverlayContext);

    return React.useMemo<DialogOverlay>(() => {
        if (!container) {
            return emptyOverlay;
        }

        // The overlay is inside the stage's `transform: scale(...)`, so its bounding rect is in
        // scaled pixels while everything laid out inside it is in authored ones. Dividing by the
        // ratio the element itself reports keeps the two in step without reading the stage's scale —
        // which the popup has no business knowing.
        const scaleOf = (rect: DOMRect): number => {
            const layoutWidth = (container as HTMLElement).offsetWidth;
            if (!layoutWidth || !rect.width) {
                return 1;
            }
            return rect.width / layoutWidth;
        };

        return {
            container,
            Portal: ({ children }) => createPortal(
                <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "auto" }}>
                    {children}
                </div>,
                container
            ),
            measure: (element) => {
                if (!element) {
                    return null;
                }
                const origin = container.getBoundingClientRect();
                const scale = scaleOf(origin);
                const rect = element.getBoundingClientRect();
                const left = (rect.left - origin.left) / scale;
                const top = (rect.top - origin.top) / scale;
                const width = rect.width / scale;
                const height = rect.height / scale;
                return {
                    left,
                    top,
                    width,
                    height,
                    right: left + width,
                    bottom: top + height,
                };
            },
        };
    }, [container]);
}
