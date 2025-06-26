import { useEffect, useLayoutEffect } from "react";
import { useFlush } from "../flush";
import { useLayout } from "./Layout";
import type { LayoutRouter } from "./router";
import { useRouter } from "./router";

export function usePathname() {
    const router = useRouter();
    const [flush] = useFlush();

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    return router.getPathname();
}

export function useParams<T extends Record<string, string>>(): T {
    const { router, path } = useLayout();
    const [flush] = useFlush();

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    return router.extractParams(router.getCurrentPath(), path) as T;
}

export function useQueryParams<T extends Record<string, string>>(): T {
    const router = useRouter();
    const [flush] = useFlush();

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    return router.getQueryParams() as T;
}

export function useRouterSyncHook(handler: (router: LayoutRouter) => void, deps: React.DependencyList) {
    const router = useRouter();

    useLayoutEffect(() => {
        return router.onUpdate(() => handler(router)).cancel;
    }, deps);

    useEffect(() => {
        handler(router);
    }, []);
}

export function useRouterFlush() {
    const router = useRouter();
    const [flush] = useFlush();

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    return flush;
}
