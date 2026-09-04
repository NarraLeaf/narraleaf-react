import type { Game } from "@lib/game/nlcore/game";
import {getImageObjectUrl} from "@lib/util/data";
import type {GameState} from "@player/gameState";
import type {PreloadStrategy} from "@core/preload/types";

type ImageCacheTask = {
    promise: Promise<void>;
    controller: AbortController;
    /** Listeners of every token handed out for this task, the first and those that followed it. */
    errorHandlers: ((reason: any) => void)[];
    /** Set once the task has failed, so a follower reports the failure instead of fetching again. */
    failed: boolean;
};
export type PreloadedToken = {
    abort: () => void;
    onFinished: (callback: () => void) => PreloadedToken;
    onErrored: (callback: (reason: any) => void) => PreloadedToken;
};

/**
 * What the image cache is holding, against what it is allowed to hold. All sizes are bytes.
 *
 * Read through {@link GameState.getImageCache}:
 * `game.getLiveGame().getGameState()?.getImageCache()?.getStats()`.
 */
export type ImageCacheStats = {
    /** Sources the cache holds a url for. */
    entries: number;
    /** Bytes of fetched image data kept alive by the object urls the cache minted. */
    blobBytes: number;
    /** Sources whose decoded bitmap the cache is holding on to. */
    decodedEntries: number;
    /** Estimated size of those bitmaps, at width × height × 4 bytes each. */
    decodedBytes: number;
    /** Entries that cannot be evicted right now: shown by a mounted `<img>`, or pinned by the scene. */
    pinned: number;
    /** The budgets in force: {@link GameConfig.imageCacheBudgetBytes} and {@link GameConfig.decodedImageBudgetBytes}. */
    budget: {
        blobBytes: number;
        decodedBytes: number;
    };
};

type ImageCacheEntry = {
    /** The source url the entry is keyed by. */
    name: string;
    /** The url an `<img>` is pointed at: an object url this cache minted, or whatever `add()` was given. */
    url: string;
    /** What the fetched bytes cost while the object url pins them; 0 for a url the cache did not mint. */
    bytes: number;
    /** The element holding the decoded bitmap, while it is retained. */
    decoded: HTMLImageElement | null;
    /** The bitmap's estimated cost; 0 while nothing is retained. */
    decodedBytes: number;
    /** Set by {@link ImageCacheManager.retain} on an entry the current scene has no use for. */
    stale: boolean;
    /**
     * What the host has to be told when this entry goes, for a url it supplied rather than one the
     * cache minted. Null for everything the cache fetched itself, which it revokes instead.
     */
    release: (() => void) | null;
};

/**
 * The player's image cache: fetched bytes as object urls, and decoded bitmaps for the images about
 * to be revealed, both under a memory budget.
 *
 * The cache used to be unbounded, and what it held was decided by the preload pass after the one
 * that filled it: a scene's registered images - every pose of every character it shows, every
 * background it cuts to - stayed fetched and decoded until the *next* scene's look-ahead pool had
 * finished, and stayed for ever if that pass was superseded before it got there. A long session on
 * a large library grew without limit and ended in a renderer out of memory. Now:
 *
 * - Both pools have a budget, read live from the game config. Past it, the least recently used
 *   entries that nothing pins go first: a bitmap is dropped and decoded again on demand, a fetched
 *   image is released and fetched again when a scene wants it. Recency is the {@link entries} map's
 *   order, refreshed by every {@link get}.
 * - Two things pin an entry against both budgets. A scene pins its opening background through
 *   {@link pin}; and every mounted `<img>` holds the url it is showing through {@link hold}, so the
 *   frame on screen - both halves of a transition in flight, a caller parked behind a scene call -
 *   is never taken out from under the DOM.
 * - What a scene keeps is decided when its pass starts, through {@link retain}: everything outside
 *   the plan is stale, dropped at once if nothing shows it and the moment its last `<img>` unmounts
 *   otherwise. That is what releases a left scene at scene exit rather than a pass later.
 */
export class ImageCacheManager {
    /** Fetch `src` and hand back a url for its bytes, and how many there are. Mocked by tests. */
    public static getImage(src: string, abortSignal?: AbortSignal, options?: RequestInit): Promise<{url: string; bytes: number}> {
        return getImageObjectUrl(src, {
            ...options,
            signal: abortSignal,
        });
    }

    /**
     * Decode an image source off-screen so the browser's decoded-image cache is warm before
     * the source is ever attached to a visible `<img>`. Without this, "preloaded" only means
     * the bytes are cached — the first reveal still pays the (async) decode cost and can paint
     * a blank frame. Decode failures are ignored: the image then simply decodes lazily on
     * first paint, exactly as before.
     *
     * Returns the element the decode ran on so callers can keep it alive (see
     * {@link ImageCacheManager.preload}'s `retainDecoded`); `null` when the environment has no
     * `Image` or no `decode()`.
     */
    private static async decodeImage(src: string): Promise<HTMLImageElement | null> {
        if (typeof window === "undefined" || typeof window.Image === "undefined") {
            return null;
        }
        const image = new window.Image();
        image.src = src;
        if (typeof image.decode !== "function") {
            return null;
        }
        try {
            await image.decode();
        } catch {
            return null;
        }
        return image;
    }

    /**
     * What a retained bitmap costs. The browser keeps a decoded image as 32-bit pixels at its
     * natural size whatever the file's format or size was, so this is the number that matters.
     */
    private static estimateDecodedBytes(image: HTMLImageElement): number {
        return (image.naturalWidth || 0) * (image.naturalHeight || 0) * 4;
    }

    /** A budget as configured; anything that is not a number reads as no limit. */
    private static readBudget(value: unknown): number {
        return typeof value === "number" && !Number.isNaN(value) ? Math.max(0, value) : Infinity;
    }

    /**
     * Every cached source, least recently used first. A touch deletes and re-inserts its entry,
     * so eviction walks the map from the front.
     */
    private entries: Map<string, ImageCacheEntry> = new Map();
    /** The same entries by the url an `<img>` shows, which is the only name an `<img>` knows. */
    private byUrl: Map<string, ImageCacheEntry> = new Map();
    private preloadTasks: Map<string, ImageCacheTask> = new Map();
    /** Urls some mounted `<img>` is showing, with how many are showing each. */
    private holds: Map<string, number> = new Map();
    /** Sources the scene pinned - its opening background - replaced as a whole by {@link pin}. */
    private pinned: Set<string> = new Set();
    /** Every source that has been through the cache, kept for {@link wasCached}. */
    private seen: Set<string> = new Set();
    private blobBytes = 0;
    private decodedBytes = 0;

    /**
     * How the cache gets bytes for a source, when the host would rather it did not fetch them.
     *
     * Installed by the preloader from `GameConfig.preload`. Unset, the cache fetches the url and
     * mints an object url for it, which is what it has always done - and which costs the renderer a
     * second copy of every image on a host whose assets are already on local disk.
     */
    private acquisition: PreloadStrategy["acquire"] | null = null;
    /** Where a source nothing warmed is reported, when the host wants to hear about it. */
    private missingReporter: PreloadStrategy["onMissing"] | null = null;
    /** Sources already reported missing, so one unpredicted image is one report and not one a frame. */
    private reportedMissing: Set<string> = new Set();

    constructor(private readonly game: Game) {
        this.game.addSideEffect(() => {
            this.abortAll();
            this.clear();
        });
    }

    /**
     * Install the host's way of obtaining bytes, or clear it.
     *
     * Set once, from the preloader, before anything is warmed. Entries already in the cache keep
     * whatever url they were built with; the cache never re-acquires something it holds.
     */
    public useAcquisition(acquire: PreloadStrategy["acquire"] | null): this {
        this.acquisition = acquire ?? null;
        return this;
    }

    /** Install the host's ear for sources nothing warmed, or clear it. */
    public useMissingReporter(onMissing: PreloadStrategy["onMissing"] | null): this {
        this.missingReporter = onMissing ?? null;
        return this;
    }

    /**
     * Say that the stage is showing `src` and no plan named it. Answers whether the host took it.
     *
     * The player's own answer to this was a console warning telling the author to register the
     * image by hand, which is only useful to someone who writes the story in TypeScript. A host that
     * planned from a compiled story can name the row instead, so it gets first refusal and the
     * warning stays for the games that have no host to ask.
     */
    public reportMissing(src: string): boolean {
        if (!this.missingReporter || this.reportedMissing.has(src)) {
            return !!this.missingReporter;
        }
        this.reportedMissing.add(src);
        this.missingReporter({type: "image", src});
        return true;
    }

    public has(name: string): boolean {
        return this.entries.has(name);
    }

    /**
     * Whether this source has ever been through the cache, whether or not it still is.
     *
     * For diagnostics that want to tell "the preloader never heard of this image" - which means an
     * image action nothing could predict, and is worth telling the author about - from "the cache
     * had it and a budget released it again", which is the cache working as designed and is not.
     */
    public wasCached(name: string): boolean {
        return this.seen.has(name);
    }

    /**
     * Cache `src` under `name` without fetching it. The bytes behind a url given this way are not
     * the cache's to count, so it weighs nothing against the fetched budget.
     */
    public add(name: string, src: string): this {
        this.insert(name, src, 0);
        return this;
    }

    public remove(name: string): this {
        const entry = this.entries.get(name);
        if (entry) {
            this.drop(entry);
        }
        return this;
    }

    /**
     * The url to show for `name`, or `undefined` when it is not cached. This is the cache's notion
     * of a use: the entry becomes the most recently used one.
     */
    public get(name: string): string | undefined {
        const entry = this.entries.get(name);
        if (!entry) {
            return undefined;
        }
        this.touch(entry);
        return entry.url;
    }

    /**
     * Whether this source has been decoded and its decoded bitmap is still held, i.e. attaching
     * it to an `<img>` can paint without an asynchronous decode first.
     */
    public isDecoded(name: string): boolean {
        return !!this.entries.get(name)?.decoded;
    }

    public clear(): this {
        for (const entry of [...this.entries.values()]) {
            this.drop(entry);
        }
        this.seen.clear();
        return this;
    }

    public size(): number {
        return this.entries.size;
    }

    public isPreloading(src: string): boolean {
        return this.preloadTasks.has(src);
    }

    /**
     * Fetch `url`, cache it as an object URL and decode it, resolving the returned token's
     * `onFinished` only once the decode has settled.
     *
     * Asking again is safe and converges. A url that is cached and, if asked, decoded settles at
     * once. One that is cached but whose bitmap the budget let go of - or that was fetched as
     * look-ahead, which never retains - is decoded again and held when `retainDecoded` asks for it,
     * so a first frame the budget evicted still gates on a decode rather than on nothing. One that
     * another pass is still fetching follows that fetch instead of getting a token that never fires.
     *
     * @param options.retainDecoded keep the decoded bitmap alive, within
     * {@link GameConfig.decodedImageBudgetBytes}, until this source leaves the cache. Use it for the
     * assets that are about to be revealed; leave it off for speculative look-ahead preloading,
     * whose bitmaps would otherwise pile up in memory.
     * @param options.decode run the off-screen decode at all. Defaults to true. Off, the bytes are
     * obtained and nothing else: measured over a real library, that is the difference between 473
     * and 2,140 milliseconds, and it is the right trade for anything the plan does not expect to be
     * revealed soon. `retainDecoded` implies a decode and overrides this.
     */
    public preload(gameState: GameState, url: string, options?: { retainDecoded?: boolean; decode?: boolean }): PreloadedToken {
        const retainDecoded = options?.retainDecoded === true;
        const decode = retainDecoded || options?.decode !== false;
        const existing = this.entries.get(url);
        if (existing && (!retainDecoded || existing.decoded)) {
            this.touch(existing);
            return ImageCacheManager.settledToken();
        }
        const running = this.preloadTasks.get(url);
        if (running) {
            return this.followTask(running, gameState, url, options);
        }
        if (existing) {
            this.touch(existing);
            return this.runTask(gameState, url, new AbortController(), () => this.decodeAgain(url, existing.url));
        }

        let srcUrl = url, requestInit: RequestInit = {};
        this.game.hooks.rawTrigger("preloadImage", () => [srcUrl, (src: string, newOptions?: RequestInit) => {
            srcUrl = src;
            requestInit = {
                ...requestInit,
                ...newOptions,
            };
        }]);

        const controller = new AbortController();
        return this.runTask(gameState, url, controller, () =>
            this.acquireAndDecode(url, srcUrl, controller.signal, requestInit, retainDecoded, decode));
    }

    public abortAll(): void {
        this.preloadTasks.forEach(task => {
            task.controller.abort();
        });
        this.preloadTasks.clear();
    }

    public abort(src: string): void {
        const task = this.preloadTasks.get(src);
        if (task) {
            task.controller.abort();
            this.preloadTasks.delete(src);
        }
    }

    public preloadedSrc(): string[] {
        return Array.from(this.entries.values(), entry => entry.url);
    }

    /**
     * Keep `names` and let everything else go.
     *
     * Called when a scene's preload pass starts, with everything the pass is about to want. An entry
     * outside the set is dropped at once unless something pins it; a pinned one is marked stale and
     * dropped the moment it is not - which for the scene that was just left is the moment its last
     * `<img>` unmounts. An entry that is back in the set is not stale any more.
     */
    public retain(names: Iterable<string>): this {
        const keep = new Set(names);
        for (const entry of [...this.entries.values()]) {
            entry.stale = !keep.has(entry.name);
            if (entry.stale && !this.isPinned(entry)) {
                this.drop(entry);
            }
        }
        return this;
    }

    /**
     * Exempt `names` from both budgets, replacing whatever was pinned before.
     *
     * For the current scene's opening background: fetched and decoded before the scene is allowed
     * to paint, and the one image a budget must never take back. Whatever a mounted `<img>` shows is
     * pinned separately, through {@link hold}, so this only needs to name what is about to be shown.
     */
    public pin(names: Iterable<string>): this {
        this.pinned = new Set(names);
        this.enforce();
        return this;
    }

    /**
     * Report that a mounted `<img>` is showing `url`; the entry behind it cannot be evicted until
     * every such `<img>` has called {@link release}. By url rather than by source name, because the
     * url is all an `<img>` knows - and a url the cache never minted is remembered and ignored.
     */
    public hold(url: string): void {
        this.holds.set(url, (this.holds.get(url) ?? 0) + 1);
    }

    /** Undo one {@link hold}. The last release drops a stale entry, and lets the budgets run again. */
    public release(url: string): void {
        const count = this.holds.get(url);
        if (count === undefined) {
            return;
        }
        if (count > 1) {
            this.holds.set(url, count - 1);
            return;
        }
        this.holds.delete(url);
        const entry = this.byUrl.get(url);
        if (!entry) {
            return;
        }
        if (entry.stale && !this.isPinned(entry)) {
            this.drop(entry);
            return;
        }
        this.enforce();
    }

    public getStats(): ImageCacheStats {
        let decodedEntries = 0;
        let pinned = 0;
        for (const entry of this.entries.values()) {
            if (entry.decoded) {
                decodedEntries++;
            }
            if (this.isPinned(entry)) {
                pinned++;
            }
        }
        return {
            entries: this.entries.size,
            blobBytes: this.blobBytes,
            decodedEntries,
            decodedBytes: this.decodedBytes,
            pinned,
            budget: this.budget(),
        };
    }

    private budget(): ImageCacheStats["budget"] {
        return {
            blobBytes: ImageCacheManager.readBudget(this.game.config?.imageCacheBudgetBytes),
            decodedBytes: ImageCacheManager.readBudget(this.game.config?.decodedImageBudgetBytes),
        };
    }

    private isPinned(entry: ImageCacheEntry): boolean {
        return this.pinned.has(entry.name) || this.holds.has(entry.url);
    }

    private touch(entry: ImageCacheEntry): void {
        this.entries.delete(entry.name);
        this.entries.set(entry.name, entry);
    }

    private insert(name: string, url: string, bytes: number, release: (() => void) | null = null): ImageCacheEntry {
        const existing = this.entries.get(name);
        if (existing) {
            if (existing.url === url) {
                this.touch(existing);
                return existing;
            }
            // A replaced url is handed back - and its bitmap belongs to it, not to the new url.
            this.drop(existing);
        }
        const entry: ImageCacheEntry = {name, url, bytes, decoded: null, decodedBytes: 0, stale: false, release};
        this.entries.set(name, entry);
        this.byUrl.set(url, entry);
        this.seen.add(name);
        this.blobBytes += bytes;
        this.enforce();
        return entry;
    }

    /**
     * Drop an entry entirely, handing back its object url.
     *
     * Every path that drops an entry goes through this. An object URL pins its blob for the
     * lifetime of the document, so a cache that forgets an entry without revoking leaks the whole
     * image - which on a scene change is most of a scene's artwork.
     */
    private drop(entry: ImageCacheEntry): void {
        this.dropDecoded(entry);
        this.handBack(entry.url, entry.release);
        this.blobBytes -= entry.bytes;
        this.entries.delete(entry.name);
        if (this.byUrl.get(entry.url) === entry) {
            this.byUrl.delete(entry.url);
        }
    }

    /** Let the bitmap go and keep the bytes; the browser decodes them again when they are next shown. */
    private dropDecoded(entry: ImageCacheEntry): void {
        if (!entry.decoded) {
            return;
        }
        this.decodedBytes -= entry.decodedBytes;
        entry.decoded = null;
        entry.decodedBytes = 0;
    }

    private retainDecoded(entry: ImageCacheEntry, image: HTMLImageElement): void {
        this.dropDecoded(entry);
        entry.decoded = image;
        entry.decodedBytes = ImageCacheManager.estimateDecodedBytes(image);
        this.decodedBytes += entry.decodedBytes;
        this.enforce();
    }

    /**
     * Bring both pools back under budget, least recently used first, skipping what is pinned.
     *
     * Fetched bytes first: dropping an entry takes its bitmap with it, and may settle the decoded
     * pool on its own. An entry that is over a budget all by itself goes too, unless it is pinned -
     * the budget is a limit, not a preference, and what is on stage is protected by the pins.
     */
    private enforce(): void {
        const budget = this.budget();
        if (this.blobBytes > budget.blobBytes) {
            for (const entry of [...this.entries.values()]) {
                if (this.blobBytes <= budget.blobBytes) {
                    break;
                }
                if (!this.isPinned(entry)) {
                    this.drop(entry);
                }
            }
        }
        if (this.decodedBytes > budget.decodedBytes) {
            for (const entry of this.entries.values()) {
                if (this.decodedBytes <= budget.decodedBytes) {
                    break;
                }
                if (entry.decoded && !this.isPinned(entry)) {
                    this.dropDecoded(entry);
                }
            }
        }
    }

    /**
     * Get the bytes for one source and, unless told not to, decode them off-screen.
     *
     * The acquisition step is the host's when one is installed: it may hand back the url unchanged
     * and own the memory itself, which is what a host serving local files should do. Otherwise the
     * cache fetches and mints an object url, and is the thing that has to revoke it.
     */
    private async acquireAndDecode(
        name: string,
        srcUrl: string,
        signal: AbortSignal,
        requestInit: RequestInit,
        retainDecoded: boolean,
        decode: boolean,
    ): Promise<void> {
        const acquired = await this.acquire(name, srcUrl, signal, requestInit);
        if (!acquired) {
            return;
        }
        const {url, bytes, release} = acquired;
        this.insert(name, url, bytes, release);
        // The budget may have taken the entry straight back; then there is nothing to warm.
        if (this.entries.get(name)?.url !== url) {
            return;
        }
        if (!decode) {
            return;
        }
        // Decode ahead of time (against the exact URL that will be assigned to
        // `<img src>`) so revealing the image later doesn't decode on its first
        // visible frame.
        const decodedImage = await ImageCacheManager.decodeImage(url);
        // The cache may have been cleared or refilled while the decode was in flight. A url this
        // pass minted is then owned by nobody, and nothing else will ever hand it back.
        const entry = this.entries.get(name);
        if (!entry || entry.url !== url) {
            this.handBack(url, release);
            return;
        }
        // Only keep the element when asked to: holding it is what stops the decoded
        // bitmap from being evicted before the reveal, and also what makes it cost memory.
        if (decodedImage && retainDecoded) {
            this.retainDecoded(entry, decodedImage);
        }
    }

    /** The bytes for one source, from the host when it has an opinion and by fetching otherwise. */
    private async acquire(
        name: string,
        srcUrl: string,
        signal: AbortSignal,
        requestInit: RequestInit,
    ): Promise<{url: string; bytes: number; release: (() => void) | null} | null> {
        if (this.acquisition) {
            const acquired = await this.acquisition({type: "image", src: name}, signal);
            if (!acquired || !acquired.url) {
                return null;
            }
            return {url: acquired.url, bytes: acquired.bytes ?? 0, release: acquired.release ?? null};
        }
        const {url, bytes} = await ImageCacheManager.getImage(srcUrl, signal, requestInit);
        return url ? {url, bytes, release: null} : null;
    }

    /**
     * Give a url back to whoever owns it: the host that supplied it, or the browser that minted it.
     *
     * One place, because the two are indistinguishable to every caller and getting it wrong leaks a
     * whole image - an object url pins its blob for the lifetime of the document.
     */
    private handBack(url: string, release: (() => void) | null): void {
        if (release) {
            release();
            return;
        }
        if (url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
        }
    }

    /** A cached entry's bitmap, wanted again after the budget let it go or a look-ahead skipped it. */
    private async decodeAgain(name: string, url: string): Promise<void> {
        const decodedImage = await ImageCacheManager.decodeImage(url);
        const entry = this.entries.get(name);
        if (decodedImage && entry && entry.url === url && !entry.decoded) {
            this.retainDecoded(entry, decodedImage);
        }
    }

    private runTask(
        gameState: GameState,
        url: string,
        controller: AbortController,
        work: () => Promise<void>,
    ): PreloadedToken {
        const task: ImageCacheTask = {
            promise: Promise.resolve(),
            controller,
            errorHandlers: [],
            failed: false,
        };
        task.promise = Promise.resolve()
            .then(work)
            .then(() => {
                this.preloadTasks.delete(url);
            })
            .catch((reason) => {
                // Drop the failed task so the URL isn't stuck in "preloading" forever —
                // otherwise every later preload() of the same URL no-ops and never retries.
                task.failed = true;
                this.preloadTasks.delete(url);
                gameState.logger.error(
                    "ImageCacheManager",
                    `Failed to preload image: ${url}`,
                    `Reason: ${reason}`
                );
                task.errorHandlers.forEach(handler => handler(reason));
            });
        this.preloadTasks.set(url, task);

        const token: PreloadedToken = {
            abort: () => {
                controller.abort();
                this.preloadTasks.delete(url);
            },
            onFinished: (callback: () => void) => {
                task.promise.then(callback);
                return token;
            },
            onErrored: (callback: (reason: any) => void) => {
                task.errorHandlers.push(callback);
                return token;
            }
        };
        return token;
    }

    /**
     * A token for a url another caller is already fetching. It finishes when that fetch has landed
     * *and* this caller's own request is met: the running task may be a look-ahead that retains no
     * bitmap, so asking again once it is done settles the difference - unless it failed, in which
     * case asking again would only fetch a broken url once per follower.
     */
    private followTask(
        task: ImageCacheTask,
        gameState: GameState,
        url: string,
        options?: { retainDecoded?: boolean },
    ): PreloadedToken {
        const token: PreloadedToken = {
            abort: () => void 0,
            onFinished: (callback: () => void) => {
                void task.promise.then(() => {
                    if (task.failed) {
                        callback();
                        return;
                    }
                    this.preload(gameState, url, options).onFinished(callback);
                });
                return token;
            },
            onErrored: (callback: (reason: any) => void) => {
                task.errorHandlers.push(callback);
                return token;
            }
        };
        return token;
    }

    /** A token for a request that is already met; it finishes on the next microtask, like the others. */
    private static settledToken(): PreloadedToken {
        const token: PreloadedToken = {
            abort: () => void 0,
            onFinished: (callback: () => void) => {
                void Promise.resolve().then(callback);
                return token;
            },
            onErrored: () => token,
        };
        return token;
    }
}
