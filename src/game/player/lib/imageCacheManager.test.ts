import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageCacheManager } from "@player/lib/ImageCacheManager";

const DATA_URL = "data:image/png;base64,AAAA";

/** Records what was decoded and through which element, so retention can be asserted. */
class FakeImage {
    static decoded: string[] = [];
    public src = "";

    decode(): Promise<void> {
        FakeImage.decoded.push(this.src);
        return Promise.resolve();
    }
}

function createManager() {
    const game = {
        addSideEffect: vi.fn(),
        hooks: { rawTrigger: vi.fn() },
    };
    return new ImageCacheManager(game as never);
}

const stateLike = { logger: { error: vi.fn() } } as never;

function preload(manager: ImageCacheManager, url: string, retainDecoded?: boolean): Promise<void> {
    return new Promise(resolve => {
        manager.preload(stateLike, url, retainDecoded === undefined ? undefined : { retainDecoded })
            .onFinished(() => resolve());
    });
}

describe("ImageCacheManager decoded retention", () => {
    beforeEach(() => {
        FakeImage.decoded = [];
        (globalThis as { window?: unknown }).window = { Image: FakeImage };
        vi.spyOn(ImageCacheManager, "getImage").mockResolvedValue(DATA_URL);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as { window?: unknown }).window;
    });

    it("decodes against the data url that will be assigned to <img src>", async () => {
        const manager = createManager();
        await preload(manager, "bg.png", true);

        expect(manager.get("bg.png")).toBe(DATA_URL);
        expect(FakeImage.decoded).toEqual([DATA_URL]);
    });

    it("keeps the decoded bitmap alive when asked to", async () => {
        const manager = createManager();
        await preload(manager, "bg.png", true);

        expect(manager.isDecoded("bg.png")).toBe(true);
    });

    it("does not retain look-ahead decodes", async () => {
        const manager = createManager();
        await preload(manager, "far-away.png", false);

        // Still decoded once (the browser cache is warmed), but nothing holds the bitmap.
        expect(FakeImage.decoded).toEqual([DATA_URL]);
        expect(manager.isDecoded("far-away.png")).toBe(false);
        expect(manager.has("far-away.png")).toBe(true);
    });

    it("releases retained bitmaps when the src is evicted", async () => {
        const manager = createManager();
        await preload(manager, "bg.png", true);

        manager.filter(["something-else.png"]);
        expect(manager.has("bg.png")).toBe(false);
        expect(manager.isDecoded("bg.png")).toBe(false);
    });

    it("releases retained bitmaps on remove and clear", async () => {
        const manager = createManager();
        await preload(manager, "a.png", true);
        manager.remove("a.png");
        expect(manager.isDecoded("a.png")).toBe(false);

        await preload(manager, "b.png", true);
        manager.clear();
        expect(manager.isDecoded("b.png")).toBe(false);
    });

    it("survives an environment without decode()", async () => {
        (globalThis as { window?: unknown }).window = { Image: class { public src = ""; } };
        const manager = createManager();
        await preload(manager, "bg.png", true);

        expect(manager.get("bg.png")).toBe(DATA_URL);
        expect(manager.isDecoded("bg.png")).toBe(false);
    });
});
