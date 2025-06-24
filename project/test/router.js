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
            off: () => {
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
            token.off();
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
        this.mountingPaths = new Set();
        this.isTransitioning = false;
        this.transitionQueue = [];
        this.currentTransitionFromPath = "";

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

        return { path: path || "", query };
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

        const fromPath = this.currentPath;

        // Start page transition
        this.startPageTransition(fromPath, resolvedPath);

        // Listen for transition completion to update state
        const transitionCompleteHandler = (completedFromPath, completedToPath) => {
            if (completedFromPath === fromPath && completedToPath === resolvedPath) {
                // Remove the listener
                this.events.off("event:router.onPageTransitionComplete", transitionCompleteHandler);
                
                // Update state after transition is complete
                this.updateStateAfterTransition(resolvedPath, finalQuery);
            }
        };

        this.events.on("event:router.onPageTransitionComplete", transitionCompleteHandler);

        return this;
    }

    updateStateAfterTransition(resolvedPath, finalQuery) {
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
    }

    back() {
        if (this.canGoBack()) {
            const fromPath = this.currentPath;
            this.historyIndex--;
            const { path, query } = this.parseUrl(this.history[this.historyIndex]);
            const toPath = path;
            
            // Start page transition
            this.startPageTransition(fromPath, toPath);

            // Listen for transition completion to update state
            const transitionCompleteHandler = (completedFromPath, completedToPath) => {
                if (completedFromPath === fromPath && completedToPath === toPath) {
                    // Remove the listener
                    this.events.off("event:router.onPageTransitionComplete", transitionCompleteHandler);
                    
                    // Update state after transition is complete
                    this.currentPath = path;
                    this.currentQuery = query;
                    this.emitOnChange();
                }
            };

            this.events.on("event:router.onPageTransitionComplete", transitionCompleteHandler);
        }
        return this;
    }

    forward() {
        if (this.canGoForward()) {
            const fromPath = this.currentPath;
            this.historyIndex++;
            const { path, query } = this.parseUrl(this.history[this.historyIndex]);
            const toPath = path;
            
            // Start page transition
            this.startPageTransition(fromPath, toPath);

            // Listen for transition completion to update state
            const transitionCompleteHandler = (completedFromPath, completedToPath) => {
                if (completedFromPath === fromPath && completedToPath === toPath) {
                    // Remove the listener
                    this.events.off("event:router.onPageTransitionComplete", transitionCompleteHandler);
                    
                    // Update state after transition is complete
                    this.currentPath = path;
                    this.currentQuery = query;
                    this.emitOnChange();
                }
            };

            this.events.on("event:router.onPageTransitionComplete", transitionCompleteHandler);
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
    }

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

    joinPath(path, ...paths) {
        return this.resolvePath(this.normalizePath(path) + "/" + paths.join("/"));
    }

    normalizePath(path) {
        return path.replace(/\/\/+/g, "/")
            .replace(/\/$/, "")
            .split("/")
            .filter(segment => segment.length > 0)
            .join("/");
    }

    updateHistory() {
        if (this.historyIndex >= 0) {
            this.history[this.historyIndex] = this.buildUrl(this.currentPath, this.currentQuery);
        }
    }

    // Page transition methods
    startPageTransition(fromPath, toPath) {
        if (this.isTransitioning) {
            // Queue the transition if another one is in progress
            this.transitionQueue.push(() => this.startPageTransition(fromPath, toPath));
            return;
        }

        this.isTransitioning = true;
        this.currentTransitionFromPath = fromPath;
        this.events.emit("event:router.onPageTransitionStart", fromPath, toPath);

        // Mark pages that need to be unmounted
        const pagesToUnmount = Array.from(this.mountedPaths).filter(path => 
            path !== toPath && !this.isPathChild(path, toPath)
        );

        if (pagesToUnmount.length === 0) {
            // No pages to unmount, proceed with mounting
            this.proceedWithMounting(toPath);
        } else {
            // Start unmounting pages
            this.unmountPages(pagesToUnmount, () => {
                this.proceedWithMounting(toPath);
            });
        }
    }

    unmountPages(pages, onComplete) {
        let unmountedCount = 0;
        const totalPages = pages.length;

        if (totalPages === 0) {
            onComplete();
            return;
        }

        pages.forEach(path => {
            this.unmountingPaths.add(path);
            this.events.emit("event:router.onPageUnmountStart", path);
        });

        // Listen for unmount complete events
        const unmountCompleteHandler = (unmountedPath) => {
            if (pages.includes(unmountedPath)) {
                unmountedCount++;
                this.unmountingPaths.delete(unmountedPath);
                
                if (unmountedCount === totalPages) {
                    this.events.off("event:router.onPageUnmountComplete", unmountCompleteHandler);
                    onComplete();
                }
            }
        };

        this.events.on("event:router.onPageUnmountComplete", unmountCompleteHandler);
    }

    proceedWithMounting(toPath) {
        this.mountingPaths.add(toPath);
        this.events.emit("event:router.onPageMountStart", toPath);
        
        // The actual mounting will be handled by the Page component
        // We'll complete the transition when the page is fully mounted
    }

    isPathChild(parentPath, childPath) {
        if (parentPath === "/") return true;
        return childPath.startsWith(parentPath + "/");
    }

    // Event handlers for page transitions
    onPageUnmountStart(handler) {
        return this.events.on("event:router.onPageUnmountStart", handler);
    }

    onPageUnmountComplete(handler) {
        return this.events.on("event:router.onPageUnmountComplete", handler);
    }

    onPageMountStart(handler) {
        return this.events.on("event:router.onPageMountStart", handler);
    }

    onPageMountComplete(handler) {
        return this.events.on("event:router.onPageMountComplete", handler);
    }

    onPageTransitionStart(handler) {
        return this.events.on("event:router.onPageTransitionStart", handler);
    }

    onPageTransitionComplete(handler) {
        return this.events.on("event:router.onPageTransitionComplete", handler);
    }

    emitPageUnmountComplete(path) {
        this.events.emit("event:router.onPageUnmountComplete", path);
    }

    emitPageMountComplete(path) {
        this.mountingPaths.delete(path);
        this.events.emit("event:router.onPageMountComplete", path);
        
        // Complete the transition using the saved fromPath
        this.isTransitioning = false;
        const fromPath = this.currentTransitionFromPath;
        this.currentTransitionFromPath = "";
        this.events.emit("event:router.onPageTransitionComplete", fromPath, path);
        
        // Process queued transitions
        if (this.transitionQueue.length > 0) {
            const nextTransition = this.transitionQueue.shift();
            if (nextTransition) {
                setTimeout(nextTransition, 0);
            }
        }
    }

    isPageUnmounting(path) {
        return this.unmountingPaths.has(path);
    }

    isPageMounting(path) {
        return this.mountingPaths.has(path);
    }

    getIsTransitioning() {
        return this.isTransitioning;
    }
}

// Export for Node.js module system (if available)
if (typeof module !== "undefined" && module.exports) {
    module.exports = { LayoutRouter, EventDispatcher, RuntimeGameError };
}
