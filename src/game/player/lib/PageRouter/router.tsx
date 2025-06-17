import React, { createContext, useContext, useState } from "react";
import { EventDispatcher } from "@lib/util/data";
import { Game } from "@core/game";
import { useGame } from "@player/provider/game-state";
import { LiveGameEventToken } from "@lib/game/nlcore/types";

type _RouterEvents = {
    "event:router.onChange": [];
    "event:router.onExitComplete": [];
    "event:router.onPageMount": [];
};

export class _Router {
    /**@internal */
    public readonly events: EventDispatcher<_RouterEvents> = new EventDispatcher();
    /**@internal */
    private current: string | null = null;
    /**@internal */
    private game: Game;
    /**@internal */
    private history: string[] = [];
    /**@internal */
    private historyIndex: number = -1;

    /**@internal */
    constructor(game: Game, defaultId?: string) {
        this.game = game;
        if (defaultId) {
            this.current = defaultId;
            this.history.push(defaultId);
            this.historyIndex = 0;
        }
    }

    public getCurrentId(): string | null {
        return this.current;
    }

    /**
     * Push a new page id to the router history
     */
    public push(id: string): this {
        if (this.historyIndex < this.history.length - 1) {
            this.history.length = this.historyIndex + 1;
        }
        this.history.push(id);

        if (this.history.length > this.game.config.maxRouterHistory) {
            this.history.shift();
            this.historyIndex--;
        }

        this.historyIndex++;
        this.current = id;
        this.emitOnChange();
        return this;
    }

    /**
     * Go back to the previous page id in the router history
     */
    public back(): this {
        if (this.historyIndex >= 0) {
            this.historyIndex--;
        }
        this.syncId();
        this.emitOnChange();

        return this;
    }

    /**
     * Go forward to the next page id in the router history
     */
    public forward(): this {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.syncId();
            this.emitOnChange();
        }
        return this;
    }

    /**
     * Clear the current page id and history
     *
     * All pages will be removed from the stage
     */
    public clear(): this {
        this.current = null;
        this.history = [];
        this.historyIndex = -1;
        this.emitOnChange();
        return this;
    }

    public cleanHistory(): this {
        this.history = this.current ? [this.current] : [];
        this.historyIndex = this.current ? 0 : -1;
        return this;
    }

    public onExitComplete(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onExitComplete", handler);
    }

    public onceExitComplete(handler: () => void): LiveGameEventToken {
        return this.events.once("event:router.onExitComplete", handler);
    }

    /**@internal */
    emitOnExitComplete(): void {
        this.events.emit("event:router.onExitComplete");
    }

    public onPageMount(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onPageMount", handler);
    }

    public oncePageMount(handler: () => void): LiveGameEventToken {
        return this.events.once("event:router.onPageMount", handler);
    }

    /**@internal */
    emitOnPageMount(): void {
        this.events.emit("event:router.onPageMount");
    }

    /**@internal */
    isActive(): boolean {
        return this.current !== null;
    }

    /**@internal */
    private emitOnChange(): void {
        this.events.emit("event:router.onChange");
    }

    /**@internal */
    private syncId(): void {
        if (this.historyIndex < 0) {
            this.current = null;
        } else {
            this.current = this.history[this.historyIndex];
        }
    }
}

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
     */
    public getCurrentPath(): string {
        return this.currentPath;
    }

    /**
     * Get pathname (path without query parameters)
     */
    public getPathname(): string {
        return this.currentPath;
    }

    /**
     * Get current query parameters
     */
    public getCurrentQuery(): Record<string, string> {
        return { ...this.currentQuery };
    }

    /**
     * Get query parameters (alias for getCurrentQuery)
     */
    public getQueryParams(): Record<string, string> {
        return this.getCurrentQuery();
    }

    /**
     * Get current full URL (path + query)
     */
    public getCurrentUrl(): string {
        return this.buildUrl(this.currentPath, this.currentQuery);
    }

    /**
     * Parse URL into path and query parameters
     * @param url URL string, e.g. "/me/settings?a=1&b=2"
     * @returns Object with path and query
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
     */
    public getQueryParam(key: string): string | undefined {
        return this.currentQuery[key];
    }

    /**
     * Set query parameter
     * @param key Parameter key
     * @param value Parameter value
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
     */
    public removeQueryParam(key: string): this {
        delete this.currentQuery[key];
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    /**
     * Clear all query parameters
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
     */
    public hasQueryParam(key: string): boolean {
        return key in this.currentQuery;
    }

    /**
     * Get all query parameter keys
     * @returns Array of parameter keys
     */
    public getQueryParamKeys(): string[] {
        return Object.keys(this.currentQuery);
    }

    /**
     * Get query parameter count
     * @returns Number of query parameters
     */
    public getQueryParamCount(): number {
        return Object.keys(this.currentQuery).length;
    }

    /**
     * Get history records
     */
    public getHistory(): string[] {
        return [...this.history];
    }

    /**
     * Get current history index
     */
    public getHistoryIndex(): number {
        return this.historyIndex;
    }

    /**
     * Check if can go back
     */
    public canGoBack(): boolean {
        return this.historyIndex > 0;
    }

    /**
     * Check if can go forward
     */
    public canGoForward(): boolean {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Navigate to new path
     * @param path Target path, e.g. "/me/settings?a=1&b=2" or "./settings" or "../parent"
     * @param queryParams Optional query parameters to append to the path
     */
    public navigate(path: string, queryParams?: Record<string, string>): this {
        const { path: resolvedPath, query } = this.parseUrl(this.resolvePath(path));

        // Merge with provided query parameters
        const finalQuery = { ...query, ...queryParams };

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
     */
    public replace(path: string, queryParams?: Record<string, string>): this {
        const { path: resolvedPath, query } = this.parseUrl(this.resolvePath(path));

        // Merge with provided query parameters
        const finalQuery = { ...query, ...queryParams };

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
     */
    public parsePath(path: string): string[] {
        return path.split("/").filter(segment => segment.length > 0);
    }

    /**
     * Build path string
     * @param segments Path segments array
     * @returns Path string
     */
    public buildPath(segments: string[]): string {
        return "/" + segments.join("/");
    }

    /**
     * Get parent path of current path
     * @param path Current path
     * @returns Parent path, returns empty string if no parent
     */
    public getParentPath(path: string): string {
        const segments = this.parsePath(path);
        if (segments.length <= 1) {
            return "";
        }
        return this.buildPath(segments.slice(0, -1));
    }

    /**
     * Check if path matches pattern
     * @param path Path to check
     * @param pattern Match pattern, supports wildcard * and parameters :param
     * @returns Whether matches
     */
    public matchPath(path: string, pattern: string): boolean {
        const pathSegments = this.parsePath(path);
        const patternSegments = this.parsePath(pattern);

        if (pathSegments.length !== patternSegments.length) {
            return false;
        }

        for (let i = 0; i < pathSegments.length; i++) {
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
     * Event listener
     */
    public onExitComplete(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onExitComplete", handler);
    }

    public onceExitComplete(handler: () => void): LiveGameEventToken {
        return this.events.once("event:router.onExitComplete", handler);
    }

    public onPageMount(handler: () => void): LiveGameEventToken {
        return this.events.on("event:router.onPageMount", handler);
    }

    public oncePageMount(handler: () => void): LiveGameEventToken {
        return this.events.once("event:router.onPageMount", handler);
    }

    /**@internal */
    emitOnExitComplete(): void {
        this.events.emit("event:router.onExitComplete");
    }

    /**@internal */
    emitOnPageMount(): void {
        this.events.emit("event:router.onPageMount");
    }

    /**@internal */
    isActive(): boolean {
        return this.currentPath !== "";
    }

    /**@internal */
    private emitOnChange(): void {
        this.events.emit("event:router.onChange");
    }

    /**
     * Resolve relative path to absolute path
     * @param path Path to resolve, can be absolute or relative
     * @returns Resolved absolute path
     */
    public resolvePath(path: string): string {
        // Extract path part from URL (remove query parameters)
        const pathOnly = path.split("?")[0];

        // If it's already an absolute path, return as is
        if (pathOnly.startsWith("/")) {
            return pathOnly;
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

    /**
     * Navigate to relative path
     * @param relativePath Relative path like "./settings" or "../parent"
     */
    public navigateRelative(relativePath: string): this {
        return this.navigate(relativePath);
    }

    /**
     * Replace current path with relative path
     * @param relativePath Relative path like "./settings" or "../parent"
     */
    public replaceRelative(relativePath: string): this {
        return this.replace(relativePath);
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
    router: _Router;
};

const RouterContext = createContext<null | RouterContextType>(null);

/**@internal */
export function RouterProvider({ children }: {
    children: React.ReactNode
}) {
    "use client";
    const game = useGame();
    const [router] = useState(() => new _Router(game));

    return (
        <>
            <RouterContext value={{ router }}>
                {children}
            </RouterContext>
        </>
    );
}

export function useRouter(): _Router {
    if (!useContext(RouterContext)) throw new Error("usePreloaded must be used within a PreloadedProvider");
    return (useContext(RouterContext) as RouterContextType).router;
}

