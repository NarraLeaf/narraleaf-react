import { useFlush } from "../flush";
import { useLayout } from "./Layout";
import { useRouter } from "./router";
import { useEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import type { LayoutRouter } from "./router";

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

/**
 * Hook to listen for page unmount start events
 * @param path The path to listen for (optional, if not provided listens for all paths)
 * @param callback Callback function to execute when unmount starts
 */
export function usePageUnmountStart(path?: string, callback?: (unmountingPath: string) => void) {
    const router = useRouter();
    const [unmountingPaths, setUnmountingPaths] = useState<string[]>([]);

    useEffect(() => {
        const token = router.onPageUnmountStart((unmountingPath) => {
            if (!path || unmountingPath === path) {
                setUnmountingPaths(prev => [...prev, unmountingPath]);
                callback?.(unmountingPath);
            }
        });

        return token.cancel;
    }, [router, path, callback]);

    return unmountingPaths;
}

/**
 * Hook to listen for page unmount complete events
 * @param path The path to listen for (optional, if not provided listens for all paths)
 * @param callback Callback function to execute when unmount completes
 */
export function usePageUnmountComplete(path?: string, callback?: (unmountedPath: string) => void) {
    const router = useRouter();
    const [unmountedPaths, setUnmountedPaths] = useState<string[]>([]);

    useEffect(() => {
        const token = router.onPageUnmountComplete((unmountedPath) => {
            if (!path || unmountedPath === path) {
                setUnmountedPaths(prev => [...prev, unmountedPath]);
                callback?.(unmountedPath);
            }
        });

        return token.cancel;
    }, [router, path, callback]);

    return unmountedPaths;
}

/**
 * Hook to listen for page mount start events
 * @param path The path to listen for (optional, if not provided listens for all paths)
 * @param callback Callback function to execute when mount starts
 */
export function usePageMountStart(path?: string, callback?: (mountingPath: string) => void) {
    const router = useRouter();
    const [mountingPaths, setMountingPaths] = useState<string[]>([]);

    useEffect(() => {
        const token = router.onPageMountStart((mountingPath) => {
            if (!path || mountingPath === path) {
                setMountingPaths(prev => [...prev, mountingPath]);
                callback?.(mountingPath);
            }
        });

        return token.cancel;
    }, [router, path, callback]);

    return mountingPaths;
}

/**
 * Hook to listen for page mount complete events
 * @param path The path to listen for (optional, if not provided listens for all paths)
 * @param callback Callback function to execute when mount completes
 */
export function usePageMountComplete(path?: string, callback?: (mountedPath: string) => void) {
    const router = useRouter();
    const [mountedPaths, setMountedPaths] = useState<string[]>([]);

    useEffect(() => {
        const token = router.onPageMountComplete((mountedPath) => {
            if (!path || mountedPath === path) {
                setMountedPaths(prev => [...prev, mountedPath]);
                callback?.(mountedPath);
            }
        });

        return token.cancel;
    }, [router, path, callback]);

    return mountedPaths;
}

/**
 * Hook to listen for page transition events
 * @param callback Callback function to execute when transition starts
 */
export function usePageTransitionStart(callback?: (fromPath: string, toPath: string) => void) {
    const router = useRouter();
    const [transitions, setTransitions] = useState<Array<{ from: string; to: string }>>([]);

    useEffect(() => {
        const token = router.onPageTransitionStart((fromPath, toPath) => {
            setTransitions(prev => [...prev, { from: fromPath, to: toPath }]);
            callback?.(fromPath, toPath);
        });

        return token.cancel;
    }, [router, callback]);

    return transitions;
}

/**
 * Hook to listen for page transition complete events
 * @param callback Callback function to execute when transition completes
 */
export function usePageTransitionComplete(callback?: (fromPath: string, toPath: string) => void) {
    const router = useRouter();
    const [completedTransitions, setCompletedTransitions] = useState<Array<{ from: string; to: string }>>([]);

    useEffect(() => {
        const token = router.onPageTransitionComplete((fromPath, toPath) => {
            setCompletedTransitions(prev => [...prev, { from: fromPath, to: toPath }]);
            callback?.(fromPath, toPath);
        });

        return token.cancel;
    }, [router, callback]);

    return completedTransitions;
}

/**
 * Hook to get current transition state
 */
export function useTransitionState() {
    const router = useRouter();
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        const checkTransitionState = () => {
            setIsTransitioning(router.getIsTransitioning());
        };

        // Check initial state
        checkTransitionState();

        // Listen for transition events to update state
        const startToken = router.onPageTransitionStart(() => {
            setIsTransitioning(true);
        });

        const completeToken = router.onPageTransitionComplete(() => {
            setIsTransitioning(false);
        });

        return () => {
            startToken.cancel();
            completeToken.cancel();
        };
    }, [router]);

    return isTransitioning;
}

/**
 * Subscribe to router changes and derive data with selector.
 * This hook is concurrency-safe (uses React 18 useSyncExternalStore).
 */
export function useRouterSnapshot<T>(selector: (router: LayoutRouter) => T): T {
    const router = useRouter();

    return useSyncExternalStore(
        // subscribe
        (callback) => router.onChange(callback).cancel,
        // get current snapshot
        () => selector(router)
    );
}
