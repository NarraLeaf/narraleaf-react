import { Game } from "@lib/game/nlcore/game";
import {getImageDataUrl} from "@lib/util/data";
import {GameState} from "@player/gameState";

type ImageCacheTask = {
    promise: Promise<void>;
    controller: AbortController;
};
export type PreloadedToken = {
    abort: () => void;
    onFinished: (callback: () => void) => PreloadedToken;
    onErrored: (callback: (reason: any) => void) => PreloadedToken;
};

export class ImageCacheManager {
    public static getImage(src: string, abortSignal?: AbortSignal, options?: RequestInit): Promise<string> {
        return getImageDataUrl(src, {
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

    private src: Map<string, string> = new Map();
    private preloadTasks: Map<string, ImageCacheTask> = new Map();
    /**
     * Decoded images held on purpose. A decoded bitmap only stays in the browser's cache while
     * something still references it, so dropping the element right after `decode()` lets the
     * bitmap be evicted and the reveal decodes all over again. Retention is opt-in per preload
     * (`retainDecoded`) because a full-resolution bitmap costs width × height × 4 bytes — worth
     * it for the scene that is about to paint, far too expensive for a whole reachable graph.
     */
    private decoded: Map<string, HTMLImageElement> = new Map();

    constructor(private readonly game: Game) {
        this.game.addSideEffect(() => {
            this.abortAll();
            this.src.clear();
            this.decoded.clear();
        });
    }

    public has(name: string): boolean {
        return this.src.has(name);
    }

    public add(name: string, src: string): this {
        this.src.set(name, src);
        return this;
    }

    public remove(name: string): this {
        this.src.delete(name);
        this.decoded.delete(name);
        return this;
    }

    public get(name: string): string | undefined {
        return this.src.get(name);
    }

    /**
     * Whether this source has been decoded and its decoded bitmap is still held, i.e. attaching
     * it to an `<img>` can paint without an asynchronous decode first.
     */
    public isDecoded(name: string): boolean {
        return this.decoded.has(name);
    }

    public clear(): this {
        this.src.clear();
        this.decoded.clear();
        return this;
    }

    public size(): number {
        return this.src.size;
    }

    public isPreloading(src: string): boolean {
        return this.preloadTasks.has(src);
    }

    /**
     * Fetch `url`, cache it as a data URL and decode it, resolving the returned token's
     * `onFinished` only once the decode has settled.
     *
     * @param options.retainDecoded keep the decoded bitmap alive until this source leaves the
     * cache. Use it for the assets that are about to be revealed; leave it off for speculative
     * look-ahead preloading, whose bitmaps would otherwise pile up in memory.
     */
    public preload(gameState: GameState, url: string, options?: { retainDecoded?: boolean }): PreloadedToken {
        if (this.src.has(url) || this.preloadTasks.has(url)) {
            const token: PreloadedToken = {
                abort: () => {
                },
                onFinished: () => {
                    return token;
                },
                onErrored: () => {
                    return token;
                }
            };
            return token;
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
        const signal = controller.signal;
        const errorHandlers: ((reason: any) => void)[] = [];

        const promise = ImageCacheManager.getImage(srcUrl, signal, requestInit).then(async (dataUrl) => {
            this.preloadTasks.delete(url);
            if (dataUrl) {
                this.add(url, dataUrl);
                // Decode ahead of time (against the exact URL that will be assigned to
                // `<img src>`) so revealing the image later doesn't decode on its first
                // visible frame.
                const decodedImage = await ImageCacheManager.decodeImage(dataUrl);
                // Only keep the element when asked to: holding it is what stops the decoded
                // bitmap from being evicted before the reveal, and also what makes it cost memory.
                if (decodedImage && options?.retainDecoded && this.src.get(url) === dataUrl) {
                    this.decoded.set(url, decodedImage);
                }
            }
        })
            .catch((reason) => {
                // Drop the failed task so the URL isn't stuck in "preloading" forever —
                // otherwise every later preload() of the same URL no-ops and never retries.
                this.preloadTasks.delete(url);
                gameState.logger.error(
                    "ImageCacheManager",
                    `Failed to preload image: ${url}`,
                    `Reason: ${reason}`
                );
                errorHandlers.forEach(handler => handler(reason));
            });

        const task: ImageCacheTask = {
            promise,
            controller,
        };
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
                errorHandlers.push(callback);
                return token;
            }
        };
        return token;
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
        return Array.from(this.src.values());
    }

    public filter(names: string[]): this {
        const keep = new Set(names);
        for (const name of this.src.keys()) {
            if (!keep.has(name)) {
                this.src.delete(name);
                this.decoded.delete(name);
            }
        }
        for (const name of this.decoded.keys()) {
            if (!keep.has(name)) {
                this.decoded.delete(name);
            }
        }
        return this;
    }
}