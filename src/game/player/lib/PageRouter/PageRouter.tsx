import React, {useEffect} from "react";
import {AnimatePresence} from "motion/react";
import {Page} from "@player/lib/PageRouter/Page";
import {useRouter} from "@player/lib/PageRouter/router";
import {useFlush} from "@player/lib/flush";
import {Stage} from "@player/lib/PageRouter/Stage";
import { useGame } from "../../provider/game-state";

type PageRouterProps = Readonly<{
    children?: React.ReactNode;
}>;

/**
 * Page Router for NarraLeaf-React
 *
 * **Note**: only `Page` and `Stage` components are allowed as children, other components will be ignored.
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
    const game = useGame();

    useEffect(() => {
        if (!router) {
            return;
        }

        return router.events.on("event:router.onChange", flush).cancel;
    }, []);

    if (!router) {
        return null;
    }

    const childrenElements = React.Children.toArray([...(game.config.stage ? [game.config.stage] : []), ...(children ? [children] : [])]);

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

    const AnimatePresence_ = AnimatePresence as any;
    return (
        <>
            {stageChild}
            <AnimatePresence_ mode="wait">
                {currentPage}
            </AnimatePresence_>
        </>
    );
}


