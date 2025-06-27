import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import React, { createContext, useContext, useEffect, useRef } from "react";
import { useFlush } from "../flush";
import { useConstant } from "../useConstant";
import { AnimatePresence } from "./AnimatePresence";
import { LayoutRouterProvider, useLayout } from "./Layout";
import { useRouterFlush, useRouterSyncHook } from "./routerHooks";

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
}>;

type PageInjectContextType = {
    name: string | null | undefined;
};

export const PageInjectContext = createContext<null | PageInjectContextType>(null);
export function usePageInject(): PageInjectContextType | null {
    return useContext(PageInjectContext);
}

export function Page({ children, name: nameProp }: PageProps) {
    const [flush] = useFlush();
    const { path: parentPath, router, consumedBy } = useLayout();
    const injected = usePageInject();
    const name = injected?.name ?? nameProp;
    const consumerName = name ?? parentPath + "@default";

    const pagePath = name ? router.joinPath(parentPath, name as string) : parentPath;
    const unmountToken = useConstant(() => router.createToken(pagePath + "@page"));
    const currentPath = router.getCurrentPath();
    const isDefaultHandler = !name;

    const mountedRef = useRef(false);
    const setMounted = (mounted: boolean) => {
        mountedRef.current = mounted;
        flush();
    };

    const display = (isDefaultHandler && router.exactMatch(currentPath, parentPath)) || router.exactMatch(currentPath, pagePath);

    if (consumedBy && consumedBy !== consumerName) {
        throw new RuntimeGameError("[PageRouter] Layout Context is consumed by a different page. This is likely caused by a nested page/layout inside a page.");
    }

    useRouterFlush();
    useRouterSyncHook((router) => {
        // We don't wait for the component to flush because it needs to respond to the router change immediately
        // And we need to use the router.getCurrentPath() instead of the component state
        const displayNow =
            (isDefaultHandler && router.exactMatch(router.getCurrentPath(), parentPath))
            || router.exactMatch(router.getCurrentPath(), pagePath);

        // Case 1: Unmount
        if (mountedRef.current && !displayNow) {
            if (!children) {
                setMounted(false);
                return;
            }
            router.registerUnmountingPath(unmountToken);
            // Fallback: If the child component does not trigger the exit animation, it also ensures that the hanging state can be released in time
            // createMicroTask(() => {
            //     router.unregisterUnmountingPath(unmountToken);
            //     setMounted(false);
            // });
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

        const eventToken = isDefaultHandler ? router.mountDefaultHandler(pagePath) : router.mount(pagePath);
        router.emitOnPageMount();

        return () => {
            eventToken.cancel();
        };
    }, [pagePath, display]);

    useEffect(() => {
        return () => {
            router.unregisterUnmountingPath(unmountToken);
            setMounted(false);
        };
    }, []);

    const content: React.ReactNode = (
        // prevent nested layout in this page
        <LayoutRouterProvider path={parentPath} consumedBy={consumerName}>
            <AnimatePresence mode="wait"
                onExitComplete={() => {
                    router.unregisterUnmountingPath(unmountToken);
                    setMounted(false);
                }}
            >
                {display && mountedRef.current && children}
            </AnimatePresence>
        </LayoutRouterProvider>
    );

    const inject = (content: React.ReactNode) => {
        if (injected) {
            return (
                <PageInjectContext value={{ name: null }}>
                    {content}
                </PageInjectContext>
            );
        }
        return content;
    };

    return inject(content);
}



