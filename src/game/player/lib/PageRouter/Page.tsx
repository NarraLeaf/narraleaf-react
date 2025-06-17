import React, { createContext, useEffect } from "react";
import {HTMLMotionProps, motion} from "motion/react";
import clsx from "clsx";
import {Full} from "@player/lib/PlayerFrames";
// import { useRouter } from "./router";
import { LayoutRouterProvider, useLayout } from "./Layout";
import { AnimatePresence } from "./AnimatePresence";
import { useGame } from "@player/provider/game-state";

export type _PageProps = Readonly<{
    id: string;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
} & HTMLMotionProps<"div">>;

export function _Page(
    {
        id,
        children,
        className,
        style,
        ...motionProps
    }: _PageProps) {

    return (
        <motion.div className={clsx("w-full h-full")} key={id} {...motionProps}>
            <Full className={className} style={style}>
                {children}
            </Full>
        </motion.div>
    );
}

export type PageProps = Readonly<{
    children?: React.ReactNode;
    /**
     * The name of the page. It can be a dynamic string. 
     * 
     * @example
     * ```typescript
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
    name: string;
    /**
     * When true, exit animations will be propagated to nested AnimatePresence components.
     */
    propagate?: boolean;
} & HTMLMotionProps<"div"> & React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>>;

type PageContextProviderProps = {
    children: React.ReactNode;
    name: string;
};

type PageContextType = {
    name: string;
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
    const { path: parentPath, router } = useLayout();
    const pagePath = router.joinPath(parentPath, name);
    const display = router.matchPath(router.getCurrentPath(), pagePath);

    useEffect(() => {
        router.mount(pagePath);
        router.emitOnPageMount();
        return () => {
            router.unmount(pagePath);
        };
    }, [pagePath, router]);

    return (
        // prevent nested layout in this page
        <LayoutRouterProvider path={null}>
            <AnimatePresence mode="wait" propagate={propagate ?? game.config.animationPropagate}>
                {display && (
                    <motion.div key={pagePath} {...props}>
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </LayoutRouterProvider>
    );
}