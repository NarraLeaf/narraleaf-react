import {RefObject, useCallback} from "react";

export function useElementVisibility<T extends HTMLElement>(ref: RefObject<T | null>) {
    const show = useCallback(() => {
        if (!ref.current) return;
        const el = ref.current;
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
        el.style.visibility = "visible";
    }, [ref]);

    const hide = useCallback(() => {
        if (!ref.current) return;
        const el = ref.current;
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.style.visibility = "hidden";
    }, [ref]);

    return { show, hide };
}