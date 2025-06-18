import React, { useEffect } from "react";
import { createContext, useContext } from "react";
import { LayoutRouter } from "./router";
import { useRouter } from "./router";
import { HTMLMotionProps, motion } from "motion/react";
import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import { AnimatePresence } from "./AnimatePresence";
import { useGame } from "@player/provider/game-state";
import { useFlush } from "../flush";
import { Full } from "../PlayerFrames";

type LayoutContextType = {
    router: LayoutRouter;
    path: string | null;
};
type LayoutContextProviderProps = {
    children: React.ReactNode;
    path: string | null;
};

const LayoutContext = createContext<null | LayoutContextType>(null);
export function LayoutRouterProvider({ children, path }: LayoutContextProviderProps) {
    const router = useRouter();
    const context: LayoutContextType = {
        router,
        path,
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
} & HTMLMotionProps<"div"> & React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;

export function Layout({ children, name, propagate, ...props }: LayoutProps) {
    const game = useGame();
    const { path, router } = useLayout();
    const layoutPath = router.joinPath(path, name);
    const display = router.matchPath(router.getCurrentPath(), layoutPath);

    useEffect(() => {
        router.mount(layoutPath);
        return () => {
            router.unmount(layoutPath);
        };
    }, [layoutPath, router]);
    
    return (
        <LayoutRouterProvider path={layoutPath}>
            <AnimatePresence mode="wait" propagate={propagate ?? game.config.animationPropagate}>
                {display && (
                    <motion.div 
                        id={name} 
                        key={layoutPath}
                        {...props}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </LayoutRouterProvider>
    );
}

export function RootLayout({ children }: { children: React.ReactNode }) {
    const game = useGame();
    const router = useRouter();
    const [flush] = useFlush();

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    function onExitComplete() {
        game.router.emitRootExitComplete();
    }

    return (
        <LayoutRouterProvider path={LayoutRouter.rootPath}>
            <AnimatePresence mode="wait" propagate={game.config.animationPropagate} onExitComplete={onExitComplete}>
                <Full
                    id={LayoutRouter.rootPath}
                    key={LayoutRouter.rootPath}
                >
                    {children}
                </Full>
            </AnimatePresence>
        </LayoutRouterProvider>
    );
}


