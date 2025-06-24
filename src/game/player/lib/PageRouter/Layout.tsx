import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import { useGame } from "@player/provider/game-state";
import React, { createContext, useContext, useEffect, useCallback } from "react";
import { useFlush } from "../flush";
import { Full } from "../PlayerFrames";
import { AnimatePresence } from "./AnimatePresence";
import { LayoutRouter, useRouter } from "./router";

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
    
    const currentPath = router.getCurrentPath();
    const isCurrentLayout = router.matchPath(currentPath, layoutPath);
    
    // Enhanced display logic to handle layout transitions properly
    const isUnmounting = router.isPageUnmounting(layoutPath);
    const isMounting = router.isPageMounting(layoutPath);
    
    // Display rules similar to Page component
    const display = isCurrentLayout && !isUnmounting || isMounting;

    if (consumedBy) {
        throw new RuntimeGameError("[PageRouter] Layout is consumed by a different layout. This is likely caused by a nested layout inside a layout.");
    }

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    useEffect(() => {
        const token = router.mount(layoutPath);
        
        return () => {
            token.cancel();
            // Remove duplicate emitPageUnmountComplete call - this should only be called when animation completes
        };
    }, [layoutPath, router]);

    // Handle exit animation completion for this layout
    const handleExitComplete = useCallback(() => {
        // Notify router that layout unmount is complete when animation finishes
        router.emitPageUnmountComplete(layoutPath);
        
        // Also notify for any child paths that might be unmounting
        // This helps coordinate page transitions
        if (router.getIsTransitioning()) {
            const currentPath = router.getCurrentPath();
            if (!currentPath.startsWith(layoutPath)) {
                // If we're transitioning away from this layout completely
                // Mark all child paths as unmounted
                setTimeout(() => {
                    router.emitPageUnmountComplete(currentPath);
                }, 0);
            }
        }
    }, [router, layoutPath]);

    return (
        <LayoutRouterProvider path={layoutPath}>
            <AnimatePresence mode="wait" propagate={propagate ?? game.config.animationPropagate} onExitComplete={handleExitComplete}>
                {display ? (
                    <div key={layoutPath + ":" + router.getCurrentPath()}>
                        {children}
                    </div>
                ) : null}
            </AnimatePresence>
        </LayoutRouterProvider>
    );
}

export function RootLayout({ children }: { children: React.ReactNode }) {
    const _game = useGame();
    const router = useRouter();
    const [flush] = useFlush();

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

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

