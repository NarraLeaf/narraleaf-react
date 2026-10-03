import type {TransformDefinitions} from "@core/elements/transform/type";

/**
 * How a show or a hide fades. A call that gives no duration changes visibility at once.
 * @internal
 */
export type VisibilityFadeOptions = {
    duration?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * Named easings that have an exact CSS timing-function equivalent. Everything else (custom
 * functions, spring-like names) falls back to "ease": a fade is cosmetic and must not depend on a
 * JS animation loop, which a hidden tab freezes.
 */
const NAMED_EASINGS: Record<string, string> = {
    linear: "linear",
    easeIn: "cubic-bezier(0.42, 0, 1, 1)",
    easeOut: "cubic-bezier(0, 0, 0.58, 1)",
    easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
};

/**
 * The CSS timing function for an easing definition, or `null` when the definition has no CSS
 * equivalent and the caller's fallback applies. An omitted easing is linear.
 * @internal
 */
export function toCssEasing(easing: TransformDefinitions.EasingDefinition | undefined): string | null {
    if (easing === undefined) {
        return "linear";
    }
    if (Array.isArray(easing)) {
        return `cubic-bezier(${easing.join(", ")})`;
    }
    if (typeof easing === "string" && NAMED_EASINGS[easing]) {
        return NAMED_EASINGS[easing];
    }
    return null;
}

/**
 * The element side of the fader: its inline style, and a layout read that makes a transition start
 * from the opacity the element is showing rather than from the value just written.
 * @internal
 */
export type FadableElement = {
    readonly style: {
        opacity: string;
        visibility: string;
        pointerEvents: string;
        transition: string;
    };
    readonly offsetWidth: number;
};

type FadeOperation = {
    readonly visible: boolean;
    readonly settle: () => void;
};

/**
 * One element's visibility: shown, hidden, or fading from one to the other.
 *
 * A fade is a CSS transition on opacity, and it ends on a timer rather than on `transitionend`,
 * which does not fire in a hidden tab or when the transition is interrupted. Whatever ends a fade -
 * its own timer, a skip, a cancel, a newer fade or the element going away - settles the promise the
 * fade returned, so nothing awaiting one can be left waiting.
 *
 * Hidden means hidden to the pointer and to the compositor too (`visibility: hidden`), exactly as an
 * instant hide always left the element; during a fade the element is visible and lets the pointer
 * through.
 * @internal
 */
export class VisibilityFader {
    private operation: FadeOperation | null = null;

    constructor(
        private readonly getElement: () => FadableElement | null,
        private readonly cssEasing: (easing: TransformDefinitions.EasingDefinition | undefined) => string = easing => toCssEasing(easing) ?? "ease",
    ) {
    }

    /** Whether a fade owns the element right now. */
    public isFading(): boolean {
        return this.operation !== null;
    }

    /**
     * Show or hide the element at once. A fade in flight is settled first and its end state is
     * overwritten by this one.
     */
    public set(visible: boolean): void {
        this.settleOperation();
        this.apply(visible);
    }

    /**
     * Fade the element in or out, resolving once it is there.
     *
     * Without a positive duration this is {@link set}. An element already showing what it is asked to
     * show resolves at once rather than spending the duration on nothing. A fade that replaces one in
     * flight starts from the opacity the element is showing at that moment.
     */
    public fadeTo(visible: boolean, options?: VisibilityFadeOptions): Promise<void> {
        const duration = options?.duration ?? 0;
        const el = this.getElement();
        if (!el || !(duration > 0)) {
            this.set(visible);
            return Promise.resolve();
        }
        if (!this.operation && this.isShowing(el) === visible) {
            this.apply(visible);
            return Promise.resolve();
        }

        // A newer fade takes the element over: the old one's promise resolves, its end state is never
        // written, and the transition below continues from wherever the old one had got to.
        this.operation?.settle();
        this.operation = null;

        if (el.style.visibility === "hidden") {
            el.style.transition = "";
            el.style.opacity = "0";
        }
        el.style.visibility = "visible";
        el.style.pointerEvents = "none";

        return new Promise<void>((resolve) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const operation: FadeOperation = {
                visible,
                settle: () => {
                    if (settled) return;
                    settled = true;
                    if (timer !== null) clearTimeout(timer);
                    if (this.operation === operation) {
                        this.operation = null;
                    }
                    resolve();
                },
            };
            this.operation = operation;

            el.style.transition = `opacity ${duration}ms ${this.cssEasing(options?.easing)}`;
            // Flush style, so the transition runs from the opacity the element is showing now.
            void el.offsetWidth;
            el.style.opacity = visible ? "1" : "0";

            timer = setTimeout(() => {
                operation.settle();
                this.apply(visible);
            }, duration);
        });
    }

    /** Land a fade in flight on its end state at once. */
    public skip(): void {
        const operation = this.operation;
        if (!operation) return;
        operation.settle();
        this.apply(operation.visible);
    }

    /**
     * Abandon a fade in flight without writing its end state. The element is left where the fade had
     * got to, and the caller says with {@link set} what it shows next.
     */
    public cancel(): void {
        this.settleOperation();
        const el = this.getElement();
        if (el) {
            el.style.transition = "";
        }
    }

    /** The element is going away: settle whatever is waiting on it. */
    public dispose(): void {
        this.settleOperation();
    }

    private settleOperation(): void {
        const operation = this.operation;
        this.operation = null;
        operation?.settle();
    }

    private isShowing(el: FadableElement): boolean {
        return el.style.visibility !== "hidden" && el.style.opacity !== "0";
    }

    private apply(visible: boolean): void {
        const el = this.getElement();
        if (!el) return;
        el.style.transition = "";
        el.style.opacity = visible ? "1" : "0";
        el.style.pointerEvents = visible ? "auto" : "none";
        el.style.visibility = visible ? "visible" : "hidden";
    }
}
