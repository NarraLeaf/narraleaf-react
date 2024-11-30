import {getImageDataUrl} from "@lib/util/data";

type ImageCacheTask = {
    promise: Promise<string>;
    controller: AbortController;
};
export type PreloadedToken = {
    abort: () => void;
    onFinished: (callback: () => void) => void;
};

export class ImageCacheManager {
    public static getImage(src: string, abortSignal?: AbortSignal): Promise<string> {
        return getImageDataUrl(src, {
            signal: abortSignal,
        });
    }

    private src: Map<string, string> = new Map();
    private preloadTasks: Map<string, ImageCacheTask> = new Map();

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

    public preload(url: string): PreloadedToken {
        if (this.src.has(url) || this.preloadTasks.has(url)) return {
            abort: () => {
            },
            onFinished: () => {
            }
        };

        const controller = new AbortController();
        const signal = controller.signal;

        const task: ImageCacheTask = {
            promise: ImageCacheManager.getImage(url, signal),
            controller,
        };
        this.preloadTasks.set(url, task);
        task.promise.then((dataUrl) => {
            this.preloadTasks.delete(url);
            if (dataUrl) {
                this.add(url, dataUrl);
            }
        });

        return {
            abort: () => {
                controller.abort();
                this.preloadTasks.delete(url);
            },
            onFinished: (callback: () => void) => {
                task.promise.then(callback);
            }
        };
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