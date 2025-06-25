import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import isEqual from "lodash/isEqual";
import React, { createContext, Ref, useCallback, useContext, useEffect, useRef } from "react";
import { useRouterSnapshot } from "./routerHooks";
import { AnimationProxyContext, AnimationProxyProps } from "./AnimationProxy";
import { LayoutRouterProvider, useLayout } from "./Layout";
import { AnimatePresence } from "./MotionPatch/AnimatePresence";
import { useGame } from "../../provider/game-state";

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

export function Page({ children, name: nameProp, propagate }: PageProps) {
    const game = useGame();
    const { path: parentPath, router, consumedBy } = useLayout();
    const injected = usePageInject();
    const animationProxyProps: Ref<AnimationProxyProps | null> = useRef(null);
    const name = injected?.name ?? nameProp;
    const consumerName = name ?? parentPath + "@default";

    const pagePath = name ? router.joinPath(parentPath, name as string) : parentPath;

    const isDefaultHandler = !name;
    const currentPath = useRouterSnapshot((r) => r.getCurrentPath());
    const isUnmounting = useRouterSnapshot((r) => r.isPageUnmounting(pagePath));

    const matchesCurrent = (isDefaultHandler && router.exactMatch(currentPath, parentPath)) || router.exactMatch(currentPath, pagePath);
    const display = matchesCurrent && !isUnmounting;

    if (consumedBy && consumedBy !== consumerName) {
        throw new RuntimeGameError("[PageRouter] Layout Context is consumed by a different page. This is likely caused by a nested page/layout inside a page.");
    }

    useEffect(() => {
        // React to router changes via snapshot subscription (no explicit flush)
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

    // local force update util using state
    const [, setRenderTick] = React.useState(0);
    const forceUpdate = () => setRenderTick(t => t + 1);

    const updateAnimationProxy = useCallback((props: AnimationProxyProps) => {
        if (!isEqual(animationProxyProps.current, props)) {
            animationProxyProps.current = props;
            forceUpdate();
        }
    }, []);

    const content: React.ReactNode = (
        // prevent nested layout in this page
        <LayoutRouterProvider path={parentPath} consumedBy={consumerName}>
            <AnimationProxyContext value={{ update: updateAnimationProxy }}>
                <AnimatePresence mode="wait" propagate={propagate ?? game.config.animationPropagate}
                    onExitComplete={() => {
                        // Notify router that page unmount is complete when animation finishes
                        router.emitPageUnmountComplete(pagePath);
                    }}
                >
                    {display && children}
                </AnimatePresence>
            </AnimationProxyContext>
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



