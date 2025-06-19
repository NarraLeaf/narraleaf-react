import { Game } from "@core/game";
import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import { LiveGameEventToken } from "@lib/game/nlcore/types";
import { EventDispatcher, EventToken } from "@lib/util/data";
import { useGame } from "@player/provider/game-state";
import React, { createContext, useContext } from "react";

type LayoutRouterEvents = {
    "event:router.onChange": [];
    "event:router.onExitComplete": [];
    "event:router.onPageMount": [];
};


export class LayoutRouter {
    /**@internal */
    public static readonly rootPath: string = "/";

    /**@internal */
    public readonly events: EventDispatcher<LayoutRouterEvents> = new EventDispatcher();
    /**@internal */
    private game: Game;
    /**@internal */
    private currentPath: string = "";
    /**@internal */
    private currentQuery: Record<string, string> = {};
    /**@internal */
    private history: string[] = [];
    /**@internal */
    private historyIndex: number = -1;
    /**@internal */
    private mountedPaths: Set<string> = new Set();
    /**@internal */
    private defaultHandlerPaths: Set<string> = new Set();

    /**@internal */
    constructor(game: Game, defaultPath: string = LayoutRouter.rootPath) {
        this.game = game;

        const { path, query } = this.parseUrl(defaultPath);
        this.currentPath = path;
        this.currentQuery = query;
        this.history.push(defaultPath);
        this.historyIndex = 0;
    }

    /**
     * Get current path
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * console.log(router.getCurrentPath()); // "/home"
     * 
     * router.navigate("/about");
     * console.log(router.getCurrentPath()); // "/about"
     * ```
     */
    public getCurrentPath(): string {
        return this.currentPath;
    }

    /**
     * Get pathname (path without query parameters)
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark");
     * console.log(router.getPathname()); // "/settings"
     * ```
     */
    public getPathname(): string {
        return this.currentPath;
    }

    /**
     * Get current query parameters
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark");
     * console.log(router.getCurrentQuery()); // { tab: "general", theme: "dark" }
     * ```
     */
    public getCurrentQuery(): Record<string, string> {
        return { ...this.currentQuery };
    }

    /**
     * Get query parameters (alias for getCurrentQuery)
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/profile?user=john&tab=info");
     * console.log(router.getQueryParams()); // { user: "john", tab: "info" }
     * ```
     */
    public getQueryParams(): Record<string, string> {
        return this.getCurrentQuery();
    }

    /**
     * Get current full URL (path + query)
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings", { tab: "general", theme: "dark" });
     * console.log(router.getCurrentUrl()); // "/settings?tab=general&theme=dark"
     * ```
     */
    public getCurrentUrl(): string {
        return this.buildUrl(this.currentPath, this.currentQuery);
    }

    /**
     * Parse URL into path and query parameters
     * @param url URL string, e.g. "/me/settings?a=1&b=2"
     * @returns Object with path and query
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * const result = router.parseUrl("/me/settings?tab=general&theme=dark");
     * console.log(result.path); // "/me/settings"
     * console.log(result.query); // { tab: "general", theme: "dark" }
     * 
     * const simple = router.parseUrl("/about");
     * console.log(simple.path); // "/about"
     * console.log(simple.query); // {}
     * ```
     */
    public parseUrl(url: string): { path: string; query: Record<string, string> } {
        const [path, queryString] = url.split("?");
        const query: Record<string, string> = {};

        if (queryString) {
            const params = queryString.split("&");
            for (const param of params) {
                const [key, value] = param.split("=");
                if (key) {
                    query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : "";
                }
            }
        }

        return { path: path || "", query };
    }

    /**
     * Build URL from path and query parameters
     * @param path Path string
     * @param query Query parameters object
     * @returns Full URL string
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * const url1 = router.buildUrl("/settings", { tab: "general", theme: "dark" });
     * console.log(url1); // "/settings?tab=general&theme=dark"
     * 
     * const url2 = router.buildUrl("/about", {});
     * console.log(url2); // "/about"
     * 
     * const url3 = router.buildUrl("/profile", { user: "john", tab: "info" });
     * console.log(url3); // "/profile?user=john&tab=info"
     * ```
     */
    public buildUrl(path: string, query: Record<string, string>): string {
        if (Object.keys(query).length === 0) {
            return path;
        }

        const queryString = Object.entries(query)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join("&");

        return `${path}?${queryString}`;
    }

    /**
     * Get query parameter value
     * @param key Parameter key
     * @returns Parameter value or undefined if not found
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark");
     * 
     * console.log(router.getQueryParam("tab")); // "general"
     * console.log(router.getQueryParam("theme")); // "dark"
     * console.log(router.getQueryParam("nonexistent")); // undefined
     * ```
     */
    public getQueryParam(key: string): string | undefined {
        return this.currentQuery[key];
    }

    /**
     * Set query parameter
     * @param key Parameter key
     * @param value Parameter value
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/settings");
     * 
     * router.setQueryParam("tab", "general");
     * console.log(router.getCurrentUrl()); // "/settings?tab=general"
     * 
     * router.setQueryParam("theme", "dark");
     * console.log(router.getCurrentUrl()); // "/settings?tab=general&theme=dark"
     * ```
     */
    public setQueryParam(key: string, value: string): this {
        this.currentQuery[key] = value;
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    /**
     * Set multiple query parameters
     * @param params Object with key-value pairs
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/settings");
     * 
     * router.setQueryParams({
     *     tab: "general",
     *     theme: "dark",
     *     lang: "en"
     * });
     * console.log(router.getCurrentUrl()); // "/settings?tab=general&theme=dark&lang=en"
     * ```
     */
    public setQueryParams(params: Record<string, string>): this {
        Object.assign(this.currentQuery, params);
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    /**
     * Remove query parameter
     * @param key Parameter key to remove
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark&lang=en");
     * 
     * router.removeQueryParam("theme");
     * console.log(router.getCurrentUrl()); // "/settings?tab=general&lang=en"
     * ```
     */
    public removeQueryParam(key: string): this {
        delete this.currentQuery[key];
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    /**
     * Clear all query parameters
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark&lang=en");
     * 
     * router.clearQueryParams();
     * console.log(router.getCurrentUrl()); // "/settings"
     * console.log(router.getCurrentQuery()); // {}
     * ```
     */
    public clearQueryParams(): this {
        this.currentQuery = {};
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    /**
     * Check if query parameter exists
     * @param key Parameter key
     * @returns Whether parameter exists
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark");
     * 
     * console.log(router.hasQueryParam("tab")); // true
     * console.log(router.hasQueryParam("theme")); // true
     * console.log(router.hasQueryParam("nonexistent")); // false
     * ```
     */
    public hasQueryParam(key: string): boolean {
        return key in this.currentQuery;
    }

    /**
     * Get all query parameter keys
     * @returns Array of parameter keys
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark&lang=en");
     * 
     * console.log(router.getQueryParamKeys()); // ["tab", "theme", "lang"]
     * ```
     */
    public getQueryParamKeys(): string[] {
        return Object.keys(this.currentQuery);
    }

    /**
     * Get query parameter count
     * @returns Number of query parameters
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * router.navigate("/settings?tab=general&theme=dark&lang=en");
     * 
     * console.log(router.getQueryParamCount()); // 3
     * 
     * router.clearQueryParams();
     * console.log(router.getQueryParamCount()); // 0
     * ```
     */
    public getQueryParamCount(): number {
        return Object.keys(this.currentQuery).length;
    }

    /**
     * Get history records
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * console.log(router.getHistory()); // ["/home", "/about", "/contact"]
     * ```
     */
    public getHistory(): string[] {
        return [...this.history];
    }

    /**
     * Get current history index
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * console.log(router.getHistoryIndex()); // 2
     * 
     * router.back();
     * console.log(router.getHistoryIndex()); // 1
     * ```
     */
    public getHistoryIndex(): number {
        return this.historyIndex;
    }

    /**
     * Check if can go back
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * console.log(router.canGoBack()); // false
     * 
     * router.navigate("/about");
     * console.log(router.canGoBack()); // true
     * 
     * router.back();
     * console.log(router.canGoBack()); // false
     * ```
     */
    public canGoBack(): boolean {
        return this.historyIndex > 0;
    }

    /**
     * Check if can go forward
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * console.log(router.canGoForward()); // false
     * 
     * router.back();
     * console.log(router.canGoForward()); // true
     * 
     * router.back();
     * console.log(router.canGoForward()); // true
     * ```
     */
    public canGoForward(): boolean {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Navigate to new path
     * @param path Target path, e.g. "/me/settings?a=1&b=2" or "./settings" or "../parent"
     * @param queryParams Optional query parameters to append to the path
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * 
     * // Navigate to absolute path
     * router.navigate("/about");
     * console.log(router.getCurrentPath()); // "/about"
     * 
     * // Navigate with query parameters
     * router.navigate("/settings", { tab: "general", theme: "dark" });
     * console.log(router.getCurrentUrl()); // "/settings?tab=general&theme=dark"
     * 
     * // Navigate to relative path
     * router.navigate("./profile");
     * console.log(router.getCurrentPath()); // "/profile"
     * 
     * // Navigate to parent directory
     * router.navigate("../parent");
     * console.log(router.getCurrentPath()); // "/parent"
     * ```
     */
    public navigate(path: string, queryParams?: Record<string, string>): this {
        const { path: originalPath, query: originalQuery } = this.parseUrl(path);
        const resolvedPath = this.resolvePath(originalPath);
        
        const finalQuery = { ...originalQuery, ...queryParams };

        // If not at the end of history, remove records after current position
        if (this.historyIndex < this.history.length - 1) {
            this.history.length = this.historyIndex + 1;
        }

        // Add new path to history
        const fullUrl = this.buildUrl(resolvedPath, finalQuery);
        this.history.push(fullUrl);

        // Limit history length
        if (this.history.length > this.game.config.maxRouterHistory) {
            this.history.shift();
            this.historyIndex--;
        }

        this.historyIndex++;
        this.currentPath = resolvedPath;
        this.currentQuery = finalQuery;
        this.emitOnChange();
        return this;
    }

    /**
     * Go back to previous path
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * router.back();
     * console.log(router.getCurrentPath()); // "/about"
     * 
     * router.back();
     * console.log(router.getCurrentPath()); // "/home"
     * 
     * router.back(); // No effect, already at the beginning
     * console.log(router.getCurrentPath()); // "/home"
     * ```
     */
    public back(): this {
        if (this.canGoBack()) {
            this.historyIndex--;
            const { path, query } = this.parseUrl(this.history[this.historyIndex]);
            this.currentPath = path;
            this.currentQuery = query;
            this.emitOnChange();
        }
        return this;
    }

    /**
     * Go forward to next path
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * router.back(); // Go to "/about"
     * router.back(); // Go to "/home"
     * 
     * router.forward(); // Go to "/about"
     * console.log(router.getCurrentPath()); // "/about"
     * 
     * router.forward(); // Go to "/contact"
     * console.log(router.getCurrentPath()); // "/contact"
     * ```
     */
    public forward(): this {
        if (this.canGoForward()) {
            this.historyIndex++;
            const { path, query } = this.parseUrl(this.history[this.historyIndex]);
            this.currentPath = path;
            this.currentQuery = query;
            this.emitOnChange();
        }
        return this;
    }

    /**
     * Replace current path (without adding to history)
     * @param path New path, supports relative paths like "./settings" or "../parent"
     * @param queryParams Optional query parameters to append to the path
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * // Replace current path without affecting history
     * router.replace("/settings", { tab: "general" });
     * console.log(router.getCurrentPath()); // "/settings"
     * console.log(router.getCurrentUrl()); // "/settings?tab=general"
     * 
     * // Can still go back to previous paths
     * router.back();
     * console.log(router.getCurrentPath()); // "/about"
     * ```
     */
    public replace(path: string, queryParams?: Record<string, string>): this {
        const { path: originalPath, query: originalQuery } = this.parseUrl(path);
        const resolvedPath = this.resolvePath(originalPath);
        
        const finalQuery = { ...originalQuery, ...queryParams };

        this.currentPath = resolvedPath;
        this.currentQuery = finalQuery;
        if (this.historyIndex >= 0) {
            this.history[this.historyIndex] = this.buildUrl(resolvedPath, finalQuery);
        } else {
            this.history.push(this.buildUrl(resolvedPath, finalQuery));
            this.historyIndex = 0;
        }
        this.emitOnChange();
        return this;
    }

    /**
     * Clear history records
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * router.clear();
     * console.log(router.getCurrentPath()); // ""
     * console.log(router.getHistory()); // []
     * console.log(router.isActive()); // false
     * ```
     */
    public clear(): this {
        this.currentPath = "";
        this.currentQuery = {};
        this.history = [];
        this.historyIndex = -1;
        this.emitOnChange();
        return this;
    }

    /**
     * Clean history records, keep only current path
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/home");
     * router.navigate("/about");
     * router.navigate("/contact");
     * 
     * router.cleanHistory();
     * console.log(router.getHistory()); // ["/contact"]
     * 
     * // Cannot go back anymore
     * console.log(router.canGoBack()); // false
     * ```
     */
    public cleanHistory(): this {
        this.history = this.currentPath ? [this.buildUrl(this.currentPath, this.currentQuery)] : [];
        this.historyIndex = this.currentPath ? 0 : -1;
        return this;
    }

    /**
     * Parse path into segments
     * @param path Path string, e.g. "/me/settings/a"
     * @returns Path segments array, e.g. ["me", "settings", "a"]
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * console.log(router.parsePath("/me/settings/a")); // ["me", "settings", "a"]
     * console.log(router.parsePath("/about")); // ["about"]
     * console.log(router.parsePath("/")); // []
     * console.log(router.parsePath("")); // []
     * ```
     */
    public parsePath(path: string): string[] {
        return path.split("/").filter(segment => segment.length > 0);
    }

    /**
     * Build path string
     * @param segments Path segments array
     * @returns Path string
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * console.log(router.buildPath(["me", "settings", "a"])); // "/me/settings/a"
     * console.log(router.buildPath(["about"])); // "/about"
     * console.log(router.buildPath([])); // "/"
     * ```
     */
    public buildPath(segments: string[]): string {
        return "/" + segments.join("/");
    }

    /**
     * Get parent path of current path
     * @param path Current path
     * @returns Parent path, returns empty string if no parent
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * console.log(router.getParentPath("/me/settings/a")); // "/me/settings"
     * console.log(router.getParentPath("/me/settings")); // "/me"
     * console.log(router.getParentPath("/me")); // ""
     * console.log(router.getParentPath("/")); // ""
     * ```
     */
    public getParentPath(path: string): string {
        const segments = this.parsePath(path);
        if (segments.length <= 1) {
            return "";
        }
        return this.buildPath(segments.slice(0, -1));
    }

    /**
     * Check if path matches pattern (supports prefix matching for nested layouts)
     * @param path Path to check
     * @param pattern Match pattern, supports wildcard * and parameters :param
     * @returns Whether matches
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * // Exact match
     * console.log(router.matchPath("/about", "/about")); // true
     * console.log(router.matchPath("/about", "/contact")); // false
     * 
     * // Prefix match (for nested layouts)
     * console.log(router.matchPath("/settings/sound", "/settings")); // true
     * console.log(router.matchPath("/settings/sound/char", "/settings")); // true
     * console.log(router.matchPath("/settings/sound", "/settings/sound")); // true
     * 
     * // Wildcard match
     * console.log(router.matchPath("/user/123/profile", "/user/*" + "/profile")); // true
     * console.log(router.matchPath("/user/123/settings", "/user/*" + "/profile")); // false
     * 
     * // Parameter match
     * console.log(router.matchPath("/user/123/profile", "/user/:id/profile")); // true
     * console.log(router.matchPath("/user/abc/profile", "/user/:id/profile")); // true
     * 
     * // Mixed pattern
     * console.log(router.matchPath("/user/123/profile/edit", "/user/:id/*" + "/edit")); // true
     * ```
     */
    public matchPath(path: string, pattern: string): boolean {
        const pathSegments = this.parsePath(path);
        const patternSegments = this.parsePath(pattern);

        if (pathSegments.length < patternSegments.length) {
            return false;
        }

        for (let i = 0; i < patternSegments.length; i++) {
            const pathSegment = pathSegments[i];
            const patternSegment = patternSegments[i];

            if (patternSegment === "*") {
                continue; // Wildcard matches any segment
            } else if (patternSegment.startsWith(":")) {
                continue; // Parameter matches any segment
            } else if (pathSegment !== patternSegment) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if path exactly matches pattern (requires exact segment count)
     * @param path Path to check
     * @param pattern Match pattern, supports wildcard * and parameters :param
     * @returns Whether exactly matches
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * // Exact match
     * console.log(router.exactMatch("/about", "/about")); // true
     * console.log(router.exactMatch("/about", "/contact")); // false
     * 
     * // No prefix matching (unlike matchPath)
     * console.log(router.exactMatch("/settings/sound", "/settings")); // false
     * console.log(router.exactMatch("/settings", "/settings")); // true
     * console.log(router.exactMatch("/settings/sound", "/settings/sound")); // true
     * 
     * // Wildcard match (exact segment count required)
     * console.log(router.exactMatch("/user/123/profile", "/user/*" + "/profile")); // true
     * console.log(router.exactMatch("/user/123/profile/edit", "/user/*" + "/profile")); // false
     * 
     * // Parameter match (exact segment count required)
     * console.log(router.exactMatch("/user/123/profile", "/user/:id/profile")); // true
     * console.log(router.exactMatch("/user/123", "/user/:id/profile")); // false
     * ```
     */
    public exactMatch(path: string, pattern: string): boolean {
        const pathSegments = this.parsePath(path);
        const patternSegments = this.parsePath(pattern);

        // Exact match requires same number of segments
        if (pathSegments.length !== patternSegments.length) {
            return false;
        }

        for (let i = 0; i < patternSegments.length; i++) {
            const pathSegment = pathSegments[i];
            const patternSegment = patternSegments[i];

            if (patternSegment === "*") {
                continue; // Wildcard matches any segment
            } else if (patternSegment.startsWith(":")) {
                continue; // Parameter matches any segment
            } else if (pathSegment !== patternSegment) {
                return false;
            }
        }

        return true;
    }

    /**
     * Extract path parameters
     * @param path Actual path
     * @param pattern Pattern with parameters, e.g. "/user/:id/profile/:tab"
     * @returns Parameter object
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * const params1 = router.extractParams("/user/123/profile", "/user/:id/profile");
     * console.log(params1); // { id: "123" }
     * 
     * const params2 = router.extractParams("/user/456/profile/settings", "/user/:id/profile/:tab");
     * console.log(params2); // { id: "456", tab: "settings" }
     * 
     * const params3 = router.extractParams("/about", "/user/:id/profile");
     * console.log(params3); // {} (no match)
     * ```
     */
    public extractParams(path: string, pattern: string): Record<string, string> {
        const params: Record<string, string> = {};
        const pathSegments = this.parsePath(path);
        const patternSegments = this.parsePath(pattern);

        if (pathSegments.length !== patternSegments.length) {
            return params;
        }

        for (let i = 0; i < patternSegments.length; i++) {
            const patternSegment = patternSegments[i];
            if (patternSegment.startsWith(":")) {
                const paramName = patternSegment.slice(1);
                params[paramName] = pathSegments[i];
            }
        }

        return params;
    }

    /**
     * Event listener for exit complete
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * const token = router.onExitComplete(() => {
     *     console.log("Page exit animation completed");
     *     // Clean up resources, show loading indicator, etc.
     * });
     * 
     * // Later, remove the listener
     * token.off();
     * ```
     */
    public onExitComplete(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onExitComplete", handler);
    }

    /**
     * Event listener for exit complete (once)
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * router.onceExitComplete(() => {
     *     console.log("Page exit completed, this will only fire once");
     *     // Perform one-time cleanup
     * });
     * ```
     */
    public onceExitComplete(handler: () => void): LiveGameEventToken {
        return this.events.once("event:router.onExitComplete", handler);
    }

    /**
     * Event listener for page mount
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * const token = router.onPageMount(() => {
     *     console.log("New page mounted");
     *     // Initialize page-specific features, load data, etc.
     * });
     * 
     * // Later, remove the listener
     * token.off();
     * ```
     */
    public onPageMount(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onPageMount", handler);
    }

    /**
     * Event listener for page mount (once)
     * @example
     * ```typescript
     * const router = new LayoutRouter(game);
     * 
     * router.oncePageMount(() => {
     *     console.log("Page mounted, this will only fire once");
     *     // Perform one-time initialization
     * });
     * ```
     */
    public oncePageMount(handler: () => void): LiveGameEventToken {
        return this.events.once("event:router.onPageMount", handler);
    }

    /**@internal */
    mount(path: string): EventToken {
        if (this.mountedPaths.has(path)) {
            throw new RuntimeGameError(`Path ${path} is already mounted. This may be caused by multiple capture segments in the same path.`);
        }
        this.mountedPaths.add(path);

        return {
            cancel: () => {
                this.unmount(path);
            }
        };
    }

    /**@internal */
    unmount(path: string): void {
        this.mountedPaths.delete(path);
    }

    /**@internal */
    mountDefaultHandler(path: string): EventToken {
        if (this.defaultHandlerPaths.has(path)) {
            throw new RuntimeGameError(`Default handler path ${path} is already mounted.`);
        }
        this.defaultHandlerPaths.add(path);

        return {
            cancel: () => {
                this.unmountDefaultHandler(path);
            }
        };
    }

    /**@internal */
    unmountDefaultHandler(path: string): void {
        this.defaultHandlerPaths.delete(path);
    }

    /**@internal */
    isDefaultHandlerMounted(path: string): boolean {
        return this.defaultHandlerPaths.has(path);
    }

    /**@internal */
    emitRootExitComplete(): void {
        this.events.emit("event:router.onExitComplete");
    }

    /**@internal */
    emitOnPageMount(): void {
        this.events.emit("event:router.onPageMount");
    }

    /**@internal */
    onRootExitComplete(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onExitComplete", handler);
    }

    /**@internal */
    isActive(): boolean {
        return this.currentPath !== "";
    }

    /**@internal */
    onChange(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onChange", handler);
    }

    /**@internal */
    private emitOnChange(): void {
        this.events.emit("event:router.onChange");
    }

    /**
     * Resolve relative path to absolute path
     * @param path Path to resolve, can be absolute or relative
     * @returns Resolved absolute path
     * @example
     * ```typescript
     * const router = new LayoutRouter(game, "/user/settings");
     * 
     * // Absolute paths
     * console.log(router.resolvePath("/about")); // "/about"
     * console.log(router.resolvePath("/user/profile")); // "/user/profile"
     * 
     * // Relative paths
     * console.log(router.resolvePath("./profile")); // "/user/profile"
     * console.log(router.resolvePath("../admin")); // "/admin"
     * console.log(router.resolvePath("../../home")); // "/home"
     * 
     * // Complex relative paths
     * console.log(router.resolvePath("./.././profile")); // "/profile"
     * console.log(router.resolvePath("../../user/./settings")); // "/user/settings"
     * ```
     */
    public resolvePath(path: string): string {
        // Extract path part from URL (remove query parameters)
        const pathOnly = path.split("?")[0];

        // If it's already an absolute path, return as is
        if (pathOnly.startsWith("/")) {
            return pathOnly;
        }

        // Handle empty path - should stay at current path
        if (pathOnly === "") {
            return this.currentPath;
        }

        // Handle relative paths
        const currentSegments = this.parsePath(this.currentPath);
        const pathSegments = pathOnly.split("/");
        const resolvedSegments: string[] = [];

        // Start with current path segments
        resolvedSegments.push(...currentSegments);

        for (let i = 0; i < pathSegments.length; i++) {
            const segment = pathSegments[i];

            if (segment === "" || segment === ".") {
                // "." or empty segment means current directory, do nothing
                continue;
            } else if (segment === "..") {
                // ".." means parent directory, remove last segment
                if (resolvedSegments.length > 0) {
                    resolvedSegments.pop();
                }
            } else {
                // Regular segment, add to path
                resolvedSegments.push(segment);
            }
        }

        return this.buildPath(resolvedSegments);
    }

    public joinPath(path: string, ...paths: string[]): string {
        return this.resolvePath(this.normalizePath(path) + "/" + paths.join("/"));
    }

    public normalizePath(path: string): string {
        return path.replace(/\/\/+/g, "/")
            .replace(/\/$/, "")
            .split("/")
            .filter(segment => segment.length > 0)
            .join("/");
    }

    /**
     * Update current history entry with current path and query
     * @internal
     */
    private updateHistory(): void {
        if (this.historyIndex >= 0) {
            this.history[this.historyIndex] = this.buildUrl(this.currentPath, this.currentQuery);
        }
    }
}


type RouterContextType = {
    router: LayoutRouter;
};

const RouterContext = createContext<null | RouterContextType>(null);
export function RouterProvider({ children }: {
    children: React.ReactNode
}) {
    const game = useGame();

    return (
        <RouterContext value={{ router: game.router }}>
            {children}
        </RouterContext>
    );
}

export function useRouter() {
    if (!useContext(RouterContext)) throw new Error("useRouter must be used within a RouterProvider");
    return (useContext(RouterContext) as RouterContextType).router;
}

