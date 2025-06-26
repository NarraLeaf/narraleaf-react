// Simple EventDispatcher implementation for testing
class EventDispatcher {
    constructor() {
        this.events = new Map();
    }

    on(eventName, handler) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName).push(handler);
        
        return {
            cancel: () => {
                const handlers = this.events.get(eventName);
                if (handlers) {
                    const index = handlers.indexOf(handler);
                    if (index > -1) {
                        handlers.splice(index, 1);
                    }
                }
            }
        };
    }

    off(eventName, handler) {
        const handlers = this.events.get(eventName);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    once(eventName, handler) {
        const token = this.on(eventName, (...args) => {
            handler(...args);
            token.cancel();
        });
        return token;
    }

    emit(eventName, ...args) {
        const handlers = this.events.get(eventName);
        if (handlers) {
            handlers.forEach(handler => handler(...args));
        }
    }
}

// Simple RuntimeGameError for testing
class RuntimeGameError extends Error {
    constructor(message) {
        super(message);
        this.name = "RuntimeGameError";
    }
}

// LayoutRouter class converted from TypeScript to JavaScript
class LayoutRouter {
    static get rootPath() {
        return "/";
    }

    constructor(game, defaultPath = LayoutRouter.rootPath) {
        this.events = new EventDispatcher();
        this.game = game;
        this.currentPath = "";
        this.currentQuery = {};
        this.history = [];
        this.historyIndex = -1;
        this.mountedPaths = new Set();
        this.defaultHandlerPaths = new Set();
        this.unmountingPaths = new Set();
        this.updateSyncHooks = new Set();

        const { path, query } = this.parseUrl(defaultPath);
        this.currentPath = path;
        this.currentQuery = query;
        this.history.push(defaultPath);
        this.historyIndex = 0;
    }

    getCurrentPath() {
        return this.currentPath;
    }

    getPathname() {
        return this.currentPath;
    }

    getCurrentQuery() {
        return { ...this.currentQuery };
    }

    getQueryParams() {
        return this.getCurrentQuery();
    }

    getCurrentUrl() {
        return this.buildUrl(this.currentPath, this.currentQuery);
    }

    parseUrl(url) {
        const [path, queryString] = url.split("?");
        const query = {};

        if (queryString) {
            const params = queryString.split("&");
            for (const param of params) {
                const [key, value] = param.split("=");
                if (key) {
                    query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : "";
                }
            }
        }
        // Fix: properly handle root path "/"
        return { path: path || "/", query };
    }

    buildUrl(path, query) {
        if (Object.keys(query).length === 0) {
            return path;
        }

        const queryString = Object.entries(query)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join("&");

        return `${path}?${queryString}`;
    }

    getQueryParam(key) {
        return this.currentQuery[key];
    }

    setQueryParam(key, value) {
        this.currentQuery[key] = value;
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    setQueryParams(params) {
        Object.assign(this.currentQuery, params);
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    removeQueryParam(key) {
        delete this.currentQuery[key];
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    clearQueryParams() {
        this.currentQuery = {};
        this.updateHistory();
        this.emitOnChange();
        return this;
    }

    hasQueryParam(key) {
        return key in this.currentQuery;
    }

    getQueryParamKeys() {
        return Object.keys(this.currentQuery);
    }

    getQueryParamCount() {
        return Object.keys(this.currentQuery).length;
    }

    getHistory() {
        return [...this.history];
    }

    getHistoryIndex() {
        return this.historyIndex;
    }

    canGoBack() {
        return this.historyIndex > 0;
    }

    canGoForward() {
        return this.historyIndex < this.history.length - 1;
    }

    navigate(path, queryParams) {
        const { path: originalPath, query: originalQuery } = this.parseUrl(path);
        const resolvedPath = this.resolvePath(originalPath);
        
        const finalQuery = { ...originalQuery, ...(queryParams || {}) };

        // If the path is the same, just update query params
        if (this.currentPath === resolvedPath) {
            this.currentQuery = finalQuery;
            if (this.historyIndex >= 0) {
                this.history[this.historyIndex] = this.buildUrl(resolvedPath, finalQuery);
            }
            this.emitOnChange();
            return this;
        }

        // Start page transition
        this.startPageTransition();

        // If not at the end of history, remove records after current position
        if (this.historyIndex < this.history.length - 1) {
            this.history.length = this.historyIndex + 1;
        }

        // Add new path to history
        const fullUrl = this.buildUrl(resolvedPath, finalQuery);
        this.history.push(fullUrl);

        // Limit history length
        const maxRouterHistory = this.game.config ? this.game.config.maxRouterHistory : 50;
        if (this.history.length > maxRouterHistory) {
            this.history.shift();
            this.historyIndex--;
        }

        this.historyIndex++;
        this.currentPath = resolvedPath;
        this.currentQuery = finalQuery;
        this.emitOnChange();
        return this;
    }

    back() {
        if (this.canGoBack()) {
            this.historyIndex--;
            const { path, query } = this.parseUrl(this.history[this.historyIndex]);
            
            // Start page transition
            this.startPageTransition();
            
            this.currentPath = path;
            this.currentQuery = query;
            this.emitOnChange();
        }
        return this;
    }

    forward() {
        if (this.canGoForward()) {
            this.historyIndex++;
            const { path, query } = this.parseUrl(this.history[this.historyIndex]);
            
            // Start page transition
            this.startPageTransition();
            
            this.currentPath = path;
            this.currentQuery = query;
            this.emitOnChange();
        }
        return this;
    }

    replace(path, queryParams) {
        const { path: originalPath, query: originalQuery } = this.parseUrl(path);
        const resolvedPath = this.resolvePath(originalPath);
        
        const finalQuery = { ...originalQuery, ...(queryParams || {}) };

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

    clear() {
        this.currentPath = "";
        this.currentQuery = {};
        this.history = [];
        this.historyIndex = -1;
        this.emitOnChange();
        return this;
    }

    cleanHistory() {
        this.history = this.currentPath ? [this.buildUrl(this.currentPath, this.currentQuery)] : [];
        this.historyIndex = this.currentPath ? 0 : -1;
        return this;
    }

    parsePath(path) {
        return path.split("/").filter(segment => segment.length > 0);
    }

    buildPath(segments) {
        return "/" + segments.join("/");
    }

    getParentPath(path) {
        const segments = this.parsePath(path);
        if (segments.length <= 1) {
            return "";
        }
        return this.buildPath(segments.slice(0, -1));
    }

    matchPath(path, pattern) {
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

    exactMatch(path, pattern) {
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

    extractParams(path, pattern) {
        const params = {};
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

    onExitComplete(handler) {
        return this.events.on("event:router.onExitComplete", handler);
    }

    onceExitComplete(handler) {
        return this.events.once("event:router.onExitComplete", handler);
    }

    onPageMount(handler) {
        return this.events.on("event:router.onPageMount", handler);
    }

    oncePageMount(handler) {
        return this.events.once("event:router.onPageMount", handler);
    }

    onUpdate(handler) {
        this.updateSyncHooks.add(handler);
        return {
            cancel: () => {
                this.updateSyncHooks.delete(handler);
            }
        };
    }

    emitUpdate() {
        this.updateSyncHooks.forEach(handler => handler());
    }

    mount(path) {
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

    unmount(path) {
        this.mountedPaths.delete(path);
    }

    mountDefaultHandler(path) {
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

    unmountDefaultHandler(path) {
        this.defaultHandlerPaths.delete(path);
    }

    isDefaultHandlerMounted(path) {
        return this.defaultHandlerPaths.has(path);
    }

    emitRootExitComplete() {
        this.events.emit("event:router.onExitComplete");
    }

    emitOnPageMount() {
        this.events.emit("event:router.onPageMount");
    }

    onRootExitComplete(handler) {
        return this.events.on("event:router.onExitComplete", handler);
    }

    isActive() {
        return this.currentPath !== "";
    }

    onChange(handler) {
        return this.events.on("event:router.onChange", handler);
    }

    emitOnChange() {
        this.events.emit("event:router.onChange");
        this.emitUpdate();
    }

    /**
     * Resolve relative path to absolute path
     */
    resolvePath(path) {
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
        const resolvedSegments = [];

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
     * Normalize path by removing duplicate slashes and trailing slashes
     */
    normalizePath(path) {
        // Remove duplicate slashes and trailing slash
        const normalized = path.replace(/\/\/+/g, "/").replace(/\/$/, "");
        // If the path is empty after normalization, return "/"
        if (normalized === "") return "/";
        // If the path starts with /, preserve it as absolute path
        if (normalized.startsWith("/")) {
            return normalized;
        }
        // For relative paths, just return the normalized path without leading slash
        return normalized;
    }

    /**
     * Join multiple path segments into a single path
     */
    joinPath(path, ...paths) {
        // Normalize the base path
        const normalizedBase = this.normalizePath(path);
        // Ensure the base path starts with / for absolute paths
        const basePath = normalizedBase.startsWith("/") ? normalizedBase : "/" + normalizedBase;
        // Filter out empty segments and join all paths
        const allSegments = [basePath, ...paths.filter(p => p.length > 0)];
        const joinedPath = allSegments.join("/");
        // Normalize the final path
        return this.normalizePath(joinedPath);
    }

    /**
     * Update current history entry with current path and query
     */
    updateHistory() {
        if (this.historyIndex >= 0) {
            this.history[this.historyIndex] = this.buildUrl(this.currentPath, this.currentQuery);
        }
    }

    startPageTransition() {
        const token = this.events.on("event:router.onPathUnmount", () => {
            if (!this.isPathsUnmounting()) {
                token.cancel();
                this.events.emit("event:router.onTransitionEnd");
            }
        });
    }

    registerUnmountingPath(path) {
        this.unmountingPaths.add(path);
    }

    isPathsUnmounting() {
        return this.unmountingPaths.size > 0;
    }

    unregisterUnmountingPath(path) {
        this.unmountingPaths.delete(path);
        this.events.emit("event:router.onPathUnmount");
    }
}

// Export for Node.js module system (if available)
if (typeof module !== "undefined" && module.exports) {
    module.exports = { LayoutRouter, EventDispatcher, RuntimeGameError };
}
