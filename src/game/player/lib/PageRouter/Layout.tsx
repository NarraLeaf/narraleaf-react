import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import { useGame } from "@player/provider/game-state";
import React, { createContext, useContext, useEffect, useRef } from "react";
import { useFlush } from "../flush";
import { Full } from "../PlayerFrames";
import { useConstant } from "../useConstant";
import { AnimatePresence } from "./AnimatePresence";
import { LayoutRouter, useRouter } from "./router";
import { useRouterFlush, useRouterSyncHook } from "./routerHooks";

type LayoutContextType = {
    router: LayoutRouter;
    path: string | null;
    consumedBy?: string;
};
type LayoutContextProviderProps = {
    children: React.ReactNode;
    path: string | null;
    consumedBy?: string;
};

const LayoutContext = createContext<null | LayoutContextType>(null);
export function LayoutRouterProvider({ children, path, consumedBy }: LayoutContextProviderProps) {
    const router = useRouter();
    const context: LayoutContextType = {
        router,
        path,
        consumedBy,
    };

    return (
        <LayoutContext value={context}>
            {children}
        </LayoutContext>
    );
}

export function useLayout() {
    const context = useContext(LayoutContext);
    if (!context) throw new Error("useLayout must be used within a LayoutRouterProvider");
    if (context.path === null) throw new RuntimeGameError("Invalid useLayout call: Trying to access layout without a parent."
        + "\nThis is likely caused by a nested Layout component or using Page inside a Page. "
    );

    return context as Omit<LayoutContextType, "path"> & {
        path: string;
    };
}

export type LayoutProps = {
    children: React.ReactNode;
    /**
     * The relative path of the layout. It can be a path or a path pattern.
     * 
     * @example
     * ```typescript
     * // Can be navigated to by "/home"
     * <Layout name="home">
     *     <div>Home</div>
     * </Layout>
     * 
     * <Layout name="user">
     *     // equivalent to "/user/:id"
     *     // Can be navigated to by "/user/123"
     *     <Layout name=":id">
     *         <div>User</div>
     *     </Layout>
     * </Layout>
     * ```
     */
    name: string;
    /**
     * When true, exit animations will be propagated to nested AnimatePresence components.
     */
    propagate?: boolean;
};

export function Layout({ children, name, propagate }: LayoutProps) {
    const game = useGame();
    const [flush] = useFlush();
    const { path, router, consumedBy } = useLayout();
    const layoutPath = router.joinPath(path, name);

    const unmountToken = useConstant(() => router.createToken(layoutPath + "@layout"));
    const currentPath = router.getCurrentPath();
    const mountedRef = useRef(false);
    const setMounted = (mounted: boolean) => {
        mountedRef.current = mounted;
        flush();
    };

    const display = router.matchPath(currentPath, layoutPath);

    useRouterFlush();
    useRouterSyncHook((router) => {
        const displayNow = router.matchPath(router.getCurrentPath(), layoutPath);

        // Case 1: Unmount
        if (mountedRef.current && !displayNow) {
            if (!children) {
                setMounted(false);
                return;
            }
            router.registerUnmountingPath(unmountToken);
        }

        // Case 2: The path matches again, cancel the previous unmount request
        if (displayNow && router.isPathsUnmounting()) {
            router.unregisterUnmountingPath(unmountToken);
        }

        // Case 3: Normal mount
        if (displayNow && !mountedRef.current && !router.isTransitioning()) {
            setMounted(true);
        }
    }, [display, children]);

    useEffect(() => {
        if (!display) {
            return;
        }

        const token = router.mount(layoutPath);
        return () => {
            token.cancel();
        };
    }, [layoutPath, router, display]);

    if (consumedBy) {
        throw new RuntimeGameError("[PageRouter] Layout is consumed by a different layout. This is likely caused by a nested layout inside a layout.");
    }

    return (
        <LayoutRouterProvider path={layoutPath}>
            <AnimatePresence mode="wait" propagate={propagate ?? game.config.animationPropagate} onExitComplete={() => {
                router.unregisterUnmountingPath(unmountToken);
                setMounted(false);
            }}>
                {display && mountedRef.current && children}
            </AnimatePresence>
        </LayoutRouterProvider>
    );
}

export function RootLayout({ children }: { children: React.ReactNode }) {
    useRouterFlush();

    return (
        <LayoutRouterProvider path={LayoutRouter.rootPath}>
            <Full
                data-layout-path={LayoutRouter.rootPath}
                key={LayoutRouter.rootPath}
            >
                {children}
            </Full>
        </LayoutRouterProvider>
    );
}

