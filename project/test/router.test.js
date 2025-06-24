import { describe, it, expect, beforeEach, vi } from "vitest";
import { LayoutRouter } from "./router.js";

// Create a simplified Game object for testing
const mockGame = {
    config: {
        maxRouterHistory: 50,
        animationPropagate: false
    }
};

describe("LayoutRouter", () => {
    let router;

    beforeEach(() => {
        router = new LayoutRouter(mockGame, "/home");
    });

    describe("Initialization", () => {
        it("should correctly initialize default path", () => {
            expect(router.getCurrentPath()).toBe("/home");
            expect(router.getHistory()).toEqual(["/home"]);
            expect(router.getHistoryIndex()).toBe(0);
        });

        it("should correctly initialize root path", () => {
            const rootRouter = new LayoutRouter(mockGame);
            expect(rootRouter.getCurrentPath()).toBe("/");
        });

        it("should correctly parse initial path with query parameters", () => {
            const routerWithQuery = new LayoutRouter(mockGame, "/settings?tab=general&theme=dark");
            expect(routerWithQuery.getCurrentPath()).toBe("/settings");
            expect(routerWithQuery.getCurrentQuery()).toEqual({ tab: "general", theme: "dark" });
        });
    });

    describe("Path Navigation", () => {
        it("should be able to navigate to new path", () => {
            router.navigate("/about");
            // Complete the transition
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            expect(router.getCurrentPath()).toBe("/about");
            expect(router.getHistory()).toEqual(["/home", "/about"]);
            expect(router.getHistoryIndex()).toBe(1);
        });

        it("should be able to navigate to path with query parameters", () => {
            router.navigate("/settings", { tab: "general", theme: "dark" });
            // Complete the transition
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/settings");
            
            expect(router.getCurrentPath()).toBe("/settings");
            expect(router.getCurrentQuery()).toEqual({ tab: "general", theme: "dark" });
            expect(router.getCurrentUrl()).toBe("/settings?tab=general&theme=dark");
        });

        it("should handle relative path navigation", () => {
            router.navigate("/user/settings");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/user/settings");
            
            router.navigate("./profile");
            router.emitPageUnmountComplete("/user/settings");
            router.emitPageMountComplete("/user/settings/profile");
            
            expect(router.getCurrentPath()).toBe("/user/settings/profile");
        });

        it("should handle parent directory navigation", () => {
            router.navigate("/user/settings/advanced");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/user/settings/advanced");
            
            router.navigate("../general");
            router.emitPageUnmountComplete("/user/settings/advanced");
            router.emitPageMountComplete("/user/settings/general");
            
            expect(router.getCurrentPath()).toBe("/user/settings/general");
        });

        it("should correctly handle complex relative paths", () => {
            router.navigate("/user/settings");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/user/settings");
            
            router.navigate("./../admin/./users");
            router.emitPageUnmountComplete("/user/settings");
            router.emitPageMountComplete("/user/admin/users");
            
            expect(router.getCurrentPath()).toBe("/user/admin/users");
        });
    });

    describe("History Management", () => {
        it("should be able to go back", () => {
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            expect(router.canGoBack()).toBe(true);
            router.back();
            router.emitPageUnmountComplete("/contact");
            router.emitPageMountComplete("/about");
            expect(router.getCurrentPath()).toBe("/about");
            
            router.back();
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/home");
            expect(router.getCurrentPath()).toBe("/home");
            expect(router.canGoBack()).toBe(false);
        });

        it("should be able to go forward", () => {
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            router.back();
            router.emitPageUnmountComplete("/contact");
            router.emitPageMountComplete("/about");
            
            router.back();
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/home");
            
            expect(router.canGoForward()).toBe(true);
            router.forward();
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            expect(router.getCurrentPath()).toBe("/about");
            
            router.forward();
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            expect(router.getCurrentPath()).toBe("/contact");
            expect(router.canGoForward()).toBe(false);
        });

        it("should be able to replace current path", () => {
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.replace("/settings");
            expect(router.getCurrentPath()).toBe("/settings");
            expect(router.getHistory()).toEqual(["/home", "/settings"]);
        });

        it("should be able to clear history", () => {
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            router.clear();
            
            expect(router.getCurrentPath()).toBe("");
            expect(router.getHistory()).toEqual([]);
            expect(router.getHistoryIndex()).toBe(-1);
            expect(router.isActive()).toBe(false);
        });

        it("should be able to clean history keeping only current", () => {
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            router.cleanHistory();
            
            expect(router.getHistory()).toEqual(["/contact"]);
            expect(router.getHistoryIndex()).toBe(0);
            expect(router.canGoBack()).toBe(false);
        });

        it("should remove subsequent history when navigating to new path", () => {
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            router.back();
            router.emitPageUnmountComplete("/contact");
            router.emitPageMountComplete("/about");
            
            router.navigate("/settings");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/settings");
            
            expect(router.getHistory()).toEqual(["/home", "/about", "/settings"]);
            expect(router.canGoForward()).toBe(false);
        });
    });

    describe("Query Parameter Handling", () => {
        beforeEach(() => {
            router.navigate("/settings?tab=general&theme=dark");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/settings");
        });

        it("should be able to get query parameters", () => {
            expect(router.getQueryParam("tab")).toBe("general");
            expect(router.getQueryParam("theme")).toBe("dark");
            expect(router.getQueryParam("nonexistent")).toBeUndefined();
        });

        it("should be able to set query parameters", () => {
            router.setQueryParam("lang", "en");
            expect(router.getQueryParam("lang")).toBe("en");
            expect(router.getCurrentUrl()).toBe("/settings?tab=general&theme=dark&lang=en");
        });

        it("should be able to batch set query parameters", () => {
            router.setQueryParams({ lang: "en", region: "us" });
            expect(router.getCurrentQuery()).toEqual({
                tab: "general",
                theme: "dark",
                lang: "en",
                region: "us"
            });
        });

        it("should be able to remove query parameters", () => {
            router.removeQueryParam("theme");
            expect(router.getCurrentQuery()).toEqual({ tab: "general" });
            expect(router.getCurrentUrl()).toBe("/settings?tab=general");
        });

        it("should be able to clear all query parameters", () => {
            router.clearQueryParams();
            expect(router.getCurrentQuery()).toEqual({});
            expect(router.getCurrentUrl()).toBe("/settings");
        });

        it("should be able to check if query parameter exists", () => {
            expect(router.hasQueryParam("tab")).toBe(true);
            expect(router.hasQueryParam("nonexistent")).toBe(false);
        });

        it("should be able to get query parameter keys list", () => {
            expect(router.getQueryParamKeys()).toEqual(["tab", "theme"]);
        });

        it("should be able to get query parameter count", () => {
            expect(router.getQueryParamCount()).toBe(2);
        });
    });

    describe("URL Parsing and Building", () => {
        it("should correctly parse URL", () => {
            const result = router.parseUrl("/settings?tab=general&theme=dark");
            expect(result.path).toBe("/settings");
            expect(result.query).toEqual({ tab: "general", theme: "dark" });
        });

        it("should correctly parse URL without query parameters", () => {
            const result = router.parseUrl("/about");
            expect(result.path).toBe("/about");
            expect(result.query).toEqual({});
        });

        it("should correctly build URL", () => {
            const url = router.buildUrl("/settings", { tab: "general", theme: "dark" });
            expect(url).toBe("/settings?tab=general&theme=dark");
        });

        it("should correctly handle URL building with empty query parameters", () => {
            const url = router.buildUrl("/about", {});
            expect(url).toBe("/about");
        });

        it("should correctly handle URL encoding", () => {
            const url = router.buildUrl("/search", { q: "hello world", type: "user&admin" });
            expect(url).toBe("/search?q=hello%20world&type=user%26admin");
        });
    });

    describe("Path Operations", () => {
        it("should correctly parse path segments", () => {
            expect(router.parsePath("/user/settings/advanced")).toEqual(["user", "settings", "advanced"]);
            expect(router.parsePath("/")).toEqual([]);
            expect(router.parsePath("")).toEqual([]);
        });

        it("should correctly build path", () => {
            expect(router.buildPath(["user", "settings", "advanced"])).toBe("/user/settings/advanced");
            expect(router.buildPath([])).toBe("/");
        });

        it("should correctly get parent path", () => {
            expect(router.getParentPath("/user/settings/advanced")).toBe("/user/settings");
            expect(router.getParentPath("/user")).toBe("");
            expect(router.getParentPath("/")).toBe("");
        });

        it("should correctly normalize path", () => {
            expect(router.normalizePath("/user//settings///advanced/")).toBe("user/settings/advanced");
            expect(router.normalizePath("///")).toBe("");
        });

        it("should correctly join paths", () => {
            // joinPath uses resolvePath, so it resolves based on current path
            expect(router.joinPath("user", "settings", "advanced")).toBe("/home/user/settings/advanced");
        });
    });

    describe("Path Matching", () => {
        it("should correctly match exact paths", () => {
            expect(router.matchPath("/about", "/about")).toBe(true);
            expect(router.matchPath("/about", "/contact")).toBe(false);
        });

        it("should correctly match prefix paths", () => {
            expect(router.matchPath("/settings/sound", "/settings")).toBe(true);
            expect(router.matchPath("/settings/sound/advanced", "/settings")).toBe(true);
        });

        it("should correctly match wildcards", () => {
            expect(router.matchPath("/user/123/profile", "/user/*/profile")).toBe(true);
            expect(router.matchPath("/user/123/settings", "/user/*/profile")).toBe(false);
        });

        it("should correctly match parameters", () => {
            expect(router.matchPath("/user/123/profile", "/user/:id/profile")).toBe(true);
            expect(router.matchPath("/user/abc/profile", "/user/:id/profile")).toBe(true);
        });

        it("should not match when path segments are insufficient", () => {
            expect(router.matchPath("/user", "/user/settings")).toBe(false);
        });
    });

    describe("Exact Path Matching", () => {
        it("should correctly match exact paths", () => {
            expect(router.exactMatch("/about", "/about")).toBe(true);
            expect(router.exactMatch("/about", "/contact")).toBe(false);
        });

        it("should not match prefix paths (unlike matchPath)", () => {
            // exactMatch requires exact segment count, no prefix matching
            expect(router.exactMatch("/settings/sound", "/settings")).toBe(false);
            expect(router.exactMatch("/settings/sound/advanced", "/settings")).toBe(false);
            expect(router.exactMatch("/settings", "/settings")).toBe(true);
        });

        it("should correctly match exact wildcards", () => {
            expect(router.exactMatch("/user/123/profile", "/user/*/profile")).toBe(true);
            expect(router.exactMatch("/user/123/profile/edit", "/user/*/profile")).toBe(false);
            expect(router.exactMatch("/user/123/settings", "/user/*/profile")).toBe(false);
        });

        it("should correctly match exact parameters", () => {
            expect(router.exactMatch("/user/123/profile", "/user/:id/profile")).toBe(true);
            expect(router.exactMatch("/user/abc/profile", "/user/:id/profile")).toBe(true);
            expect(router.exactMatch("/user/123", "/user/:id/profile")).toBe(false);
            expect(router.exactMatch("/user/123/profile/edit", "/user/:id/profile")).toBe(false);
        });

        it("should not match when segment counts differ", () => {
            expect(router.exactMatch("/user", "/user/settings")).toBe(false);
            expect(router.exactMatch("/user/settings/advanced", "/user/settings")).toBe(false);
        });

        it("should correctly handle complex patterns", () => {
            expect(router.exactMatch("/api/v1/users/123", "/api/v1/users/:id")).toBe(true);
            expect(router.exactMatch("/api/v1/users/123/posts", "/api/v1/users/:id")).toBe(false);
            expect(router.exactMatch("/api/v2/users/123", "/api/v1/users/:id")).toBe(false);
        });

        it("should correctly handle root path matching", () => {
            expect(router.exactMatch("/", "/")).toBe(true);
            expect(router.exactMatch("/home", "/")).toBe(false);
            expect(router.exactMatch("/", "/home")).toBe(false);
        });

        it("should correctly handle multiple wildcards", () => {
            expect(router.exactMatch("/api/v1/users/123/posts/456", "/api/*/users/*/posts/*")).toBe(true);
            expect(router.exactMatch("/api/v1/users/123/posts", "/api/*/users/*/posts/*")).toBe(false);
        });

        it("should correctly handle mixed wildcards and parameters", () => {
            expect(router.exactMatch("/user/admin/profile/123", "/user/*/profile/:id")).toBe(true);
            expect(router.exactMatch("/user/admin/settings/123", "/user/*/profile/:id")).toBe(false);
            expect(router.exactMatch("/user/admin/profile/123/edit", "/user/*/profile/:id")).toBe(false);
        });
    });

    describe("Parameter Extraction", () => {
        it("should correctly extract path parameters", () => {
            const params = router.extractParams("/user/123/profile", "/user/:id/profile");
            expect(params).toEqual({ id: "123" });
        });

        it("should correctly extract multiple parameters", () => {
            const params = router.extractParams("/user/456/profile/settings", "/user/:id/profile/:tab");
            expect(params).toEqual({ id: "456", tab: "settings" });
        });

        it("should return empty object when path does not match", () => {
            const params = router.extractParams("/about", "/user/:id/profile");
            expect(params).toEqual({});
        });
    });

    describe("Event Handling", () => {
        it("should be able to listen to path change events", () => {
            const handler = vi.fn();
            const token = router.onChange(handler);
            
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            expect(handler).toHaveBeenCalledTimes(1);
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            expect(handler).toHaveBeenCalledTimes(2);
            
            token.off();
            router.navigate("/settings");
            expect(handler).toHaveBeenCalledTimes(2);
        });

        it("should be able to listen to page mount events", () => {
            const handler = vi.fn();
            const token = router.onPageMount(handler);
            
            router.emitOnPageMount();
            expect(handler).toHaveBeenCalledTimes(1);
            
            token.off();
        });

        it("should be able to listen to exit complete events", () => {
            const handler = vi.fn();
            const token = router.onExitComplete(handler);
            
            router.emitRootExitComplete();
            expect(handler).toHaveBeenCalledTimes(1);
            
            token.off();
        });

        it("should support one-time event listening", () => {
            const handler = vi.fn();
            router.oncePageMount(handler);
            
            router.emitOnPageMount();
            router.emitOnPageMount();
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe("Mount Management", () => {
        it("should be able to mount and unmount paths", () => {
            const token = router.mount("/settings");
            expect(() => router.mount("/settings")).toThrow("Path /settings is already mounted");
            
            token.cancel();
            expect(() => router.mount("/settings")).not.toThrow();
        });

        it("should be able to mount and unmount default handlers", () => {
            const token = router.mountDefaultHandler("/settings");
            expect(router.isDefaultHandlerMounted("/settings")).toBe(true);
            expect(() => router.mountDefaultHandler("/settings")).toThrow("Default handler path /settings is already mounted");
            
            token.cancel();
            expect(router.isDefaultHandlerMounted("/settings")).toBe(false);
        });
    });

    describe("History Limit", () => {
        it("should limit history length", () => {
            // Create a router with history limit of 3
            const limitedGame = { config: { maxRouterHistory: 3 } };
            const limitedRouter = new LayoutRouter(limitedGame, "/");
            
            limitedRouter.navigate("/1");
            limitedRouter.emitPageUnmountComplete("/");
            limitedRouter.emitPageMountComplete("/1");
            
            limitedRouter.navigate("/2");
            limitedRouter.emitPageUnmountComplete("/1");
            limitedRouter.emitPageMountComplete("/2");
            
            limitedRouter.navigate("/3");
            limitedRouter.emitPageUnmountComplete("/2");
            limitedRouter.emitPageMountComplete("/3");
            
            limitedRouter.navigate("/4");
            limitedRouter.emitPageUnmountComplete("/3");
            limitedRouter.emitPageMountComplete("/4");
            
            expect(limitedRouter.getHistory().length).toBe(3);
            expect(limitedRouter.getHistory()).toEqual(["/2", "/3", "/4"]);
        });
    });

    describe("Edge Cases", () => {
        it("should correctly handle empty paths", () => {
            router.navigate("");
            expect(router.getCurrentPath()).toBe("/home"); // Empty path maintains current path
        });

        it("should correctly handle root path navigation", () => {
            router.navigate("/");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/");
            expect(router.getCurrentPath()).toBe("/");
        });

        it("should correctly handle special characters in query parameters", () => {
            router.navigate("/search?q=a%20b&type=c%26d");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/search");
            expect(router.getQueryParam("q")).toBe("a b");
            expect(router.getQueryParam("type")).toBe("c&d");
        });

        it("should not be able to go back when history is empty", () => {
            router.clear();
            expect(router.canGoBack()).toBe(false);
            router.back();
            expect(router.getCurrentPath()).toBe("");
        });

        it("should not be able to go forward when at end of history", () => {
            expect(router.canGoForward()).toBe(false);
            router.forward();
            expect(router.getCurrentPath()).toBe("/home");
        });
    });

    describe("Page Transition Logic", () => {
        it("should start page transition when navigating to different path", () => {
            const transitionStartHandler = vi.fn();
            router.onPageTransitionStart(transitionStartHandler);
            
            router.navigate("/about");
            
            expect(transitionStartHandler).toHaveBeenCalledWith("/home", "/about");
            expect(router.getIsTransitioning()).toBe(true);
        });

        it("should not start transition when navigating to same path", () => {
            const transitionStartHandler = vi.fn();
            router.onPageTransitionStart(transitionStartHandler);
            
            router.navigate("/home");
            
            expect(transitionStartHandler).not.toHaveBeenCalled();
            expect(router.getIsTransitioning()).toBe(false);
        });

        it("should queue transitions when one is already in progress", () => {
            const transitionStartHandler = vi.fn();
            router.onPageTransitionStart(transitionStartHandler);
            
            // Start first transition
            router.navigate("/about");
            expect(transitionStartHandler).toHaveBeenCalledTimes(1);
            
            // Start second transition while first is still in progress
            router.navigate("/contact");
            expect(transitionStartHandler).toHaveBeenCalledTimes(1); // Still only 1 call
            
            // Complete first transition (need to complete unmount first)
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            expect(transitionStartHandler).toHaveBeenCalledTimes(2); // Now second transition starts
        });

        it("should emit unmount events for pages that need to be unmounted", () => {
            const unmountStartHandler = vi.fn();
            router.onPageUnmountStart(unmountStartHandler);
            
            // Mount some pages
            router.mount("/home");
            router.mount("/about");
            
            // Navigate to a different path
            router.navigate("/contact");
            
            expect(unmountStartHandler).toHaveBeenCalledWith("/home");
            expect(unmountStartHandler).toHaveBeenCalledWith("/about");
        });

        it("should not unmount child pages", () => {
            const unmountStartHandler = vi.fn();
            router.onPageUnmountStart(unmountStartHandler);
            
            // Mount parent and child pages
            router.mount("/user");
            router.mount("/user/profile");
            
            // Navigate to child path
            router.navigate("/user/profile");
            
            expect(unmountStartHandler).not.toHaveBeenCalled();
        });

        it("should complete transition when all pages are unmounted", () => {
            const transitionCompleteHandler = vi.fn();
            router.onPageTransitionComplete(transitionCompleteHandler);
            
            // Mount a page
            router.mount("/home");
            
            // Navigate to different path
            router.navigate("/about");
            
            // Simulate page unmount complete
            router.emitPageUnmountComplete("/home");
            
            // Simulate page mount complete
            router.emitPageMountComplete("/about");
            
            expect(transitionCompleteHandler).toHaveBeenCalledWith("/home", "/about");
            expect(router.getIsTransitioning()).toBe(false);
        });

        it("should update state only after transition is complete", () => {
            // Mount a page
            router.mount("/home");
            
            // Navigate to different path
            router.navigate("/about");
            
            // State should not be updated yet
            expect(router.getCurrentPath()).toBe("/home");
            
            // Complete the transition
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            // Now state should be updated
            expect(router.getCurrentPath()).toBe("/about");
        });

        it("should handle back navigation with transitions", () => {
            const transitionCompleteHandler = vi.fn();
            router.onPageTransitionComplete(transitionCompleteHandler);
            
            // Navigate to some pages
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            // Go back
            router.back();
            
            // Complete the back transition
            router.emitPageUnmountComplete("/contact");
            router.emitPageMountComplete("/about");
            
            expect(transitionCompleteHandler).toHaveBeenCalledWith("/contact", "/about");
            expect(router.getCurrentPath()).toBe("/about");
        });

        it("should handle forward navigation with transitions", () => {
            const transitionCompleteHandler = vi.fn();
            router.onPageTransitionComplete(transitionCompleteHandler);
            
            // Navigate to some pages
            router.navigate("/about");
            router.emitPageUnmountComplete("/home");
            router.emitPageMountComplete("/about");
            
            router.navigate("/contact");
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            // Go back
            router.back();
            router.emitPageUnmountComplete("/contact");
            router.emitPageMountComplete("/about");
            
            // Go forward
            router.forward();
            
            // Complete the forward transition
            router.emitPageUnmountComplete("/about");
            router.emitPageMountComplete("/contact");
            
            expect(transitionCompleteHandler).toHaveBeenCalledWith("/about", "/contact");
            expect(router.getCurrentPath()).toBe("/contact");
        });

        it("should track mounting and unmounting states correctly", () => {
            // Mount a page
            router.mount("/home");
            
            // Navigate to different path
            router.navigate("/about");
            
            expect(router.isPageUnmounting("/home")).toBe(true);
            expect(router.isPageMounting("/about")).toBe(true);
            
            // Complete unmount
            router.emitPageUnmountComplete("/home");
            expect(router.isPageUnmounting("/home")).toBe(false);
            
            // Complete mount
            router.emitPageMountComplete("/about");
            expect(router.isPageMounting("/about")).toBe(false);
        });

        it("should handle multiple pages unmounting simultaneously", () => {
            const unmountCompleteHandler = vi.fn();
            router.onPageUnmountComplete(unmountCompleteHandler);
            
            // Mount multiple pages
            router.mount("/home");
            router.mount("/about");
            router.mount("/contact");
            
            // Navigate to different path
            router.navigate("/settings");
            
            // Complete unmounts one by one
            router.emitPageUnmountComplete("/home");
            expect(router.getIsTransitioning()).toBe(true);
            
            router.emitPageUnmountComplete("/about");
            expect(router.getIsTransitioning()).toBe(true);
            
            router.emitPageUnmountComplete("/contact");
            // Now all pages are unmounted, should proceed to mounting
            expect(router.isPageMounting("/settings")).toBe(true);
        });
    });
});
