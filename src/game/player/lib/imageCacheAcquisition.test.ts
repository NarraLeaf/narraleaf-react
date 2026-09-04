import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageCacheManager } from "@player/lib/ImageCacheManager";

/**
 * The two seams a host takes the preloader over through: where the bytes come from, and who hears
 * about a source nothing warmed.
 *
 * Kept apart from `imageCacheManager.test.ts` because that file's fixture exists to measure budgets
 * and object-url hygiene, and every test here is about the cache NOT minting one.
 */

class FakeImage {
    static decoded: string[] = [];
    public src = "";
    public naturalWidth = 100;
    public naturalHeight = 100;

    decode(): Promise<void> {
        FakeImage.decoded.push(this.src);
        return Promise.resolve();
    }
}

const revoked: string[] = [];

function createManager() {
    const game = {
        addSideEffect: vi.fn(),
        hooks: { rawTrigger: vi.fn() },
        config: { imageCacheBudgetBytes: Infinity, decodedImageBudgetBytes: Infinity },
    };
    return new ImageCacheManager(game as never);
}

const stateLike = { logger: { error: vi.fn() } } as never;

function preload(
    manager: ImageCacheManager,
    url: string,
    options?: { retainDecoded?: boolean; decode?: boolean },
): Promise<void> {
    return new Promise(resolve => {
        manager.preload(stateLike, url, options).onFinished(() => resolve());
    });
}

describe("a host that supplies its own transport", () => {
    beforeEach(() => {
        FakeImage.decoded = [];
        revoked.length = 0;
        (globalThis as { window?: unknown }).window = { Image: FakeImage };
        (globalThis as { URL?: unknown }).URL = {
            createObjectURL: () => "blob:nlr/unused",
            revokeObjectURL: (url: string) => {
                revoked.push(url);
            },
        };
        vi.spyOn(ImageCacheManager, "getImage").mockImplementation(async () => {
            throw new Error("the cache fetched something a host had already answered for");
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as { window?: unknown }).window;
        delete (globalThis as { URL?: unknown }).URL;
    });

    it("shows the host's url and never fetches", async () => {
        const manager = createManager();
        manager.useAcquisition(async resource => ({ url: `app://fs/${resource.src}`, bytes: 0 }));

        await preload(manager, "bg.png", { retainDecoded: true });

        expect(manager.get("bg.png")).toBe("app://fs/bg.png");
        expect(ImageCacheManager.getImage).not.toHaveBeenCalled();
    });

    it("counts nothing against the fetched budget for memory the host owns", async () => {
        const manager = createManager();
        manager.useAcquisition(async resource => ({ url: `app://fs/${resource.src}` }));

        await preload(manager, "bg.png");

        expect(manager.getStats().blobBytes).toBe(0);
    });

    it("hands the entry back to the host rather than revoking a url it never minted", async () => {
        const manager = createManager();
        const released: string[] = [];
        manager.useAcquisition(async resource => ({
            url: `app://fs/${resource.src}`,
            release: () => released.push(resource.src),
        }));

        await preload(manager, "bg.png");
        manager.remove("bg.png");

        expect(released).toEqual(["bg.png"]);
        expect(revoked).toEqual([]);
    });

    it("warms nothing for a resource the host declines", async () => {
        const manager = createManager();
        manager.useAcquisition(async () => null);

        await preload(manager, "bg.png");

        expect(manager.has("bg.png")).toBe(false);
    });
});

describe("deciding not to decode", () => {
    beforeEach(() => {
        FakeImage.decoded = [];
        (globalThis as { window?: unknown }).window = { Image: FakeImage };
        (globalThis as { URL?: unknown }).URL = {
            createObjectURL: () => "blob:nlr/unused",
            revokeObjectURL: () => void 0,
        };
        vi.spyOn(ImageCacheManager, "getImage").mockImplementation(async () => ({ url: "blob:nlr/0", bytes: 8 }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as { window?: unknown }).window;
        delete (globalThis as { URL?: unknown }).URL;
    });

    it("holds the bytes and skips the decode when asked to", async () => {
        const manager = createManager();

        await preload(manager, "far-away.png", { decode: false });

        expect(manager.has("far-away.png")).toBe(true);
        expect(FakeImage.decoded).toEqual([]);
    });

    it("still decodes when nothing said otherwise, which is what every caller used to get", async () => {
        const manager = createManager();

        await preload(manager, "bg.png");

        expect(FakeImage.decoded).toEqual(["blob:nlr/0"]);
    });

    it("decodes anyway for a caller that wants the bitmap kept", async () => {
        const manager = createManager();

        await preload(manager, "bg.png", { retainDecoded: true, decode: false });

        expect(manager.isDecoded("bg.png")).toBe(true);
    });
});

describe("reporting a source nothing warmed", () => {
    it("tells the host, once per source", () => {
        const manager = createManager();
        const missed: string[] = [];
        manager.useMissingReporter(resource => missed.push(resource.src));

        expect(manager.reportMissing("surprise.png")).toBe(true);
        expect(manager.reportMissing("surprise.png")).toBe(true);

        expect(missed).toEqual(["surprise.png"]);
    });

    it("says so when there is no host to tell, so the player can warn instead", () => {
        const manager = createManager();

        expect(manager.reportMissing("surprise.png")).toBe(false);
    });
});
