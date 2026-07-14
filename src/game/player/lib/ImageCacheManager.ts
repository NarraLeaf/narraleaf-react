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
     */
    private static decodeImage(src: string): Promise<void> {
        if (typeof window === "undefined" || typeof window.Image === "undefined") {
            return Promise.resolve();
        }
        const image = new window.Image();
        image.src = src;
        if (typeof image.decode !== "function") {
            return Promise.resolve();
        }
        return image.decode().catch(() => void 0);
    }

    private src: Map<string, string> = new Map();
    private preloadTasks: Map<string, ImageCacheTask> = new Map();

    constructor(private readonly game: Game) {
        this.game.addSideEffect(() => {
            this.abortAll();
            this.src.clear();
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
        return this;
    }

    public get(name: string): string | undefined {
        return this.src.get(name);
    }

    public clear(): this {
        this.src.clear();
        return this;
    }

    public size(): number {
        return this.src.size;
    }

    public isPreloading(src: string): boolean {
        return this.preloadTasks.has(src);
    }

    public preload(gameState: GameState, url: string): PreloadedToken {
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
        let srcUrl = url, options: RequestInit = {};
        this.game.hooks.rawTrigger("preloadImage", () => [srcUrl, (src: string, newOptions?: RequestInit) => {
            srcUrl = src;
            options = {
                ...options,
                ...newOptions,
            };
        }]);

        const controller = new AbortController();
        const signal = controller.signal;
        const errorHandlers: ((reason: any) => void)[] = [];

        const promise = ImageCacheManager.getImage(srcUrl, signal, options).then(async (dataUrl) => {
            this.preloadTasks.delete(url);
            if (dataUrl) {
                this.add(url, dataUrl);
                // Decode ahead of time (against the exact URL that will be assigned to
                // `<img src>`) so revealing the image later doesn't decode on its first
                // visible frame.
                await ImageCacheManager.decodeImage(dataUrl);
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
        for (const name of this.src.keys()) {
            if (!names.includes(name)) {
                this.src.delete(name);
            }
        }
        return this;
    }
}