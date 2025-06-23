import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import React, { createContext, useContext, useEffect } from "react";
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
    name?: string | null;
    /**
     * When true, exit animations will be propagated to nested AnimatePresence components.
     */
    propagate?: boolean;
}>;

type PageInjectContextType = {
    name: string | null | undefined;
};

export const PageInjectContext = createContext<null | PageInjectContextType>(null);
export function usePageInject(): PageInjectContextType | null {
    return useContext(PageInjectContext);
}

export function Page({ children: children, name: nameProp }: PageProps) {
    const [flush] = useFlush();
    const { path: parentPath, router, consumedBy } = useLayout();
    const injected = usePageInject();
    const name = injected?.name ?? nameProp;
    const consumerName = name ?? parentPath + "@default";

    const pagePath = name ? router.joinPath(parentPath, name as string) : parentPath;

    const isDefaultHandler = !name;
    const display = (isDefaultHandler && router.exactMatch(router.getCurrentPath(), parentPath)) || router.exactMatch(router.getCurrentPath(), pagePath);

    if (consumedBy && consumedBy !== consumerName) {
        throw new RuntimeGameError("[PageRouter] Layout Context is consumed by a different page. This is likely caused by a nested page/layout inside a page.");
    }

    useEffect(() => {
        return router.onChange(flush).cancel;
    }, []);

    useEffect(() => {
        const token = isDefaultHandler ? router.mountDefaultHandler(pagePath) : router.mount(pagePath);
        router.emitOnPageMount();

        // Notify router that page mount is complete
        if (display) {
            router.emitPageMountComplete(pagePath);
        }

        return () => {
            token.cancel();
        };
    }, [pagePath, router, isDefaultHandler, display]);

    const content: React.ReactNode = (
        // prevent nested layout in this page
        <LayoutRouterProvider path={parentPath} consumedBy={consumerName}>
            <AnimatePresence mode="wait">
                {display && children}
            </AnimatePresence>
        </LayoutRouterProvider>
    );

    if (injected) {
        return (
            // Prevent children from consuming the injected context
            <PageInjectContext value={{ name: null }}>
                {content}
            </PageInjectContext>
        );
    }

    return content;
}


