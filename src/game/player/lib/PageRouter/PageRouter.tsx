import React, {useEffect} from "react";
import {AnimatePresence} from "motion/react";
import {Page} from "@player/lib/PageRouter/Page";
import {useRouter} from "@player/lib/PageRouter/router";
import {useFlush} from "@player/lib/flush";
import {Stage} from "@player/lib/PageRouter/Stage";

type PageRouterProps = Readonly<{
    children?: React.ReactNode;
}>;

/**
 * Page Router for NarraLeaf-React
 *
 * **Note**: only `Page` components are allowed as children, other components will be ignored.
 *
 * @example
 * ```tsx
 * const router = useRouter("home");
 * ```
 * ```tsx
 * <PageRouter router={router}>
 *     <Page id="home">
 *         <Home />
 *     </Page>
 *     <Page id="about">
 *         <About />
 *         <Contact />
 *     </Page>
 * </PageRouter>
 * ```
 */
export function PageRouter(
    {
        children,
    }: PageRouterProps) {
    const [flush] = useFlush();
    const router = useRouter();

    useEffect(() => {
        if (!router) {
            return;
        }
        return router.events.on("event:router.onChange", flush).cancel;
    }, []);

    if (!router) {
        return null;
    }

    const childrenElements = React.Children.toArray(children);

    const validConstructor = Page;
    const validChildren = childrenElements.filter(
        function (child): child is React.ReactElement<React.ComponentProps<typeof validConstructor>, typeof validConstructor> {
            return React.isValidElement(child) && child.type === validConstructor;
        }
    );
    const currentPage: React.ReactElement<React.ComponentProps<typeof validConstructor>, typeof validConstructor> | undefined =
        validChildren.find((child) => {
            return child.props.id === router.getCurrentId();
        });

    const stageConstructor = Stage;
    const stageChild = childrenElements.find(
        function (child): child is React.ReactElement<React.ComponentProps<typeof stageConstructor>, typeof stageConstructor> {
            return React.isValidElement(child) && child.type === stageConstructor;
        }
    );

    return (
        <>
            {stageChild}
            <AnimatePresence>
                {currentPage}
            </AnimatePresence>
        </>
    );
}


