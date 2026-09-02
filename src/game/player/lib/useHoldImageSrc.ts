import {RefObject, useLayoutEffect, useRef} from "react";
import {useOptionalPreloaded} from "@player/provider/preloaded";

/** One watched `<img>`: the element being watched, and what undoing that costs the cache. */
type Attachment = {
    element: HTMLImageElement;
    release: () => void;
};

/**
 * Tell the image cache which url this `<img>` is showing, for as long as it shows it.
 *
 * The cache evicts by budget and drops a left scene's images as soon as nothing needs them, and
 * "nothing needs them" has exactly one witness: whether some mounted `<img>` still has the url as
 * its `src`. So the leaf reports it. The attribute is watched rather than a prop, because a
 * non-layered image's `src` is written imperatively, frame by frame, by its transition and never
 * passes through React - and because both halves of a transition in flight are `<img>`s, which is
 * what keeps the outgoing picture from being taken back mid-fade.
 *
 * Layout effects rather than passive ones: the first hold has to land in the same task as the
 * commit that wrote the `src`, before any fetch that finishes in between gets to run the budget.
 * The attaching one runs after every commit rather than only the first, because the element may
 * not exist yet on the pass this hook is first called on - a dialogue avatar renders nothing until
 * there is a speaker with one - and because React may replace the node underneath the ref. It does
 * nothing at all once it is already watching the right element.
 */
export function useHoldImageSrc(ref: RefObject<HTMLImageElement | null>): void {
    const cacheManager = useOptionalPreloaded()?.cacheManager ?? null;
    const attachment = useRef<Attachment | null>(null);

    const detach = () => {
        attachment.current?.release();
        attachment.current = null;
    };

    useLayoutEffect(() => {
        const element = ref.current;
        if (attachment.current?.element === element) {
            return;
        }
        detach();
        if (!element || !cacheManager || typeof MutationObserver === "undefined") {
            return;
        }

        let held: string | null = null;
        const sync = () => {
            const next = element.getAttribute("src");
            if (next === held) {
                return;
            }
            if (held !== null) {
                cacheManager.release(held);
            }
            held = next;
            if (held !== null) {
                cacheManager.hold(held);
            }
        };
        const observer = new MutationObserver(sync);
        attachment.current = {
            element,
            release: () => {
                observer.disconnect();
                if (held !== null) {
                    cacheManager.release(held);
                    held = null;
                }
            },
        };
        sync();
        observer.observe(element, {attributes: true, attributeFilter: ["src"]});
    });

    // The element's own unmount is not observable from here - a disconnected node stops emitting
    // mutations rather than reporting that it went - so the hook's unmount is what hands the url
    // back.
    useLayoutEffect(() => detach, []);
}
