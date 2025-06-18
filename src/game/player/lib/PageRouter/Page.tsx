import { useGame } from "@player/provider/game-state";
import { HTMLMotionProps, motion } from "motion/react";
import React, { createContext, useEffect } from "react";
import { useFlush } from "../flush";
import { AnimatePresence } from "./AnimatePresence";
import { LayoutRouterProvider, useLayout } from "./Layout";

export type PageProps = Readonly<{
    children?: React.ReactNode;
    /**
     * The name of the page. It can be a dynamic string, null, or undefined.
     * 
     * If name is null or undefined, this page becomes the default handler for its parent layout.
     * It will be rendered whenever the parent layout matches and no specific page name matches.
     * 
     * @example
     * <Page name="home">
     *     // Can be navigated to by "/home"
     *     <div>Home</div>
     * </Page>
     * 
     * <Layout path="user">
     *     <Page name="profile">
     *         // Can be navigated to by "/user/profile"
     *         <div>User Profile</div>
     *     </Page>
     *     
     *     <Page name={null}>
     *         // Default handler for "/user" - renders when no specific page matches
     *         <div>User Default Page</div>
     *     </Page>
     * </Layout>
     * 
     * <Layout path="user">
     *     <Layout path=":id">
     *         <Page name="profile">
     *             // Can be navigated to by "/user/123/profile"
     *             <div>User Profile</div>
     *         </Page>
     *     </Layout>
     * </Layout>
     * ```
     */
    name: string | null | undefined;
    /**
     * When true, exit animations will be propagated to nested AnimatePresence components.
     */
    propagate?: boolean;
} & HTMLMotionProps<"div"> & React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>>;

type PageContextProviderProps = {
    children: React.ReactNode;
    name: string | null | undefined;
};

type PageContextType = {
    name: string | null | undefined;
};

const PageContext = createContext<null | PageContextType>(null);
export function PageProvider({ children, name }: PageContextProviderProps) {
    const context: PageContextType = {
        name,
    };

    return (
        <PageContext value={context}>
            {children}
        </PageContext>
    );
}   

export function Page({ children, name, propagate, ...props }: PageProps) {
    const game = useGame();
    const [flush] = useFlush();
    const { path: parentPath, router } = useLayout();
    
    const pagePath = name ? router.joinPath(parentPath, name as string) : parentPath;
    const mountPath = name ? pagePath : `${parentPath}/__default_handler`;
    
    const isDefaultHandler = !name;
    const parentMatches = router.matchPath(router.getCurrentPath(), parentPath);
    const specificPageMatches = isDefaultHandler ? false : router.matchPath(router.getCurrentPath(), pagePath);
    
    const display = isDefaultHandler ? parentMatches && !specificPageMatches : specificPageMatches;

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    useEffect(() => {
        const token = isDefaultHandler ? router.mountDefaultHandler(mountPath) : router.mount(mountPath);
        router.emitOnPageMount();

        return () => {
            token.cancel();
        };
    }, [mountPath, router, isDefaultHandler]);

    return (
        // prevent nested layout in this page
        <LayoutRouterProvider path={null}>
            <AnimatePresence mode="wait" propagate={propagate ?? game.config.animationPropagate}>
                {display && (
                    <motion.div key={mountPath} {...props}>
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </LayoutRouterProvider>
    );
}