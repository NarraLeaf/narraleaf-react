import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageCacheManager } from "@player/lib/ImageCacheManager";

const OBJECT_URL = "blob:nlr/one";

/** Object URLs handed out and taken back, so leaks show up as an assertion rather than as memory. */
const objectUrls = { created: [] as string[], revoked: [] as string[] };

/** Records what was decoded and through which element, so retention can be asserted. */
class FakeImage {
    static decoded: string[] = [];
    /** When set, decodes hang here until the test releases them. */
    static gate: (() => void) | null = null;
    public src = "";

    decode(): Promise<void> {
        FakeImage.decoded.push(this.src);
        if (!FakeImage.gate) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            FakeImage.gate = resolve;
        });
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
        FakeImage.gate = null;
        objectUrls.created = [];
        objectUrls.revoked = [];
        (globalThis as { window?: unknown }).window = { Image: FakeImage };
        (globalThis as { URL?: unknown }).URL = {
            createObjectURL: (blob: unknown) => {
                const url = `blob:nlr/${objectUrls.created.length}`;
                objectUrls.created.push(url);
                void blob;
                return url;
            },
            revokeObjectURL: (url: string) => {
                objectUrls.revoked.push(url);
            },
        };
        vi.spyOn(ImageCacheManager, "getImage").mockResolvedValue(OBJECT_URL);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as { window?: unknown }).window;
        delete (globalThis as { URL?: unknown }).URL;
    });

    it("decodes against the object url that will be assigned to <img src>", async () => {
        const manager = createManager();
        await preload(manager, "bg.png", true);

        expect(manager.get("bg.png")).toBe(OBJECT_URL);
        expect(FakeImage.decoded).toEqual([OBJECT_URL]);
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
        expect(FakeImage.decoded).toEqual([OBJECT_URL]);
        expect(manager.isDecoded("far-away.png")).toBe(false);
        expect(manager.has("far-away.png")).toBe(true);
    });

    it("releases retained bitmaps when the src is evicted", async () => {
        const manager = createManager();
        await preload(manager, "bg.png", true);

        manager.filter(["something-else.png"]);
        expect(manager.has("bg.png")).toBe(false);
        expect(manager.isDecoded("bg.png")).toBe(false);
        // An object URL pins its blob until it is revoked, so eviction has to hand it back.
        expect(objectUrls.revoked).toEqual([OBJECT_URL]);
    });

    it("releases retained bitmaps on remove and clear", async () => {
        const manager = createManager();
        await preload(manager, "a.png", true);
        manager.remove("a.png");
        expect(manager.isDecoded("a.png")).toBe(false);
        expect(objectUrls.revoked).toEqual([OBJECT_URL]);

        await preload(manager, "b.png", true);
        manager.clear();
        expect(manager.isDecoded("b.png")).toBe(false);
        expect(objectUrls.revoked).toEqual([OBJECT_URL, OBJECT_URL]);
    });

    it("revokes an object url the cache dropped while its decode was still in flight", async () => {
        const manager = createManager();
        // A held decode stands in for the real gap between caching a url and holding its bitmap.
        FakeImage.gate = () => undefined;
        const finished = preload(manager, "bg.png", true);
        await Promise.resolve();
        await Promise.resolve();
        // A scene change lands in that gap. The entry is gone, and the url this pass minted is
        // owned by nobody - nothing else would ever hand it back.
        manager.filter([]);
        expect(objectUrls.revoked).toEqual([OBJECT_URL]);
        const release = FakeImage.gate as unknown as () => void;
        release();
        await finished;

        expect(manager.has("bg.png")).toBe(false);
        expect(manager.isDecoded("bg.png")).toBe(false);
        // Twice: the eviction hands it back, and so does the landing decode, which cannot tell
        // whether the entry it was filling was dropped or replaced. Revoking a url that is already
        // gone is a no-op, and the alternative - trusting whoever got there first - leaks whenever
        // the eviction is the one that loses the race.
        expect(objectUrls.revoked).toEqual([OBJECT_URL, OBJECT_URL]);
    });

    it("revokes the url it replaces when the same source is cached again", () => {
        const manager = createManager();
        manager.add("bg.png", "blob:nlr/old");
        manager.add("bg.png", "blob:nlr/new");

        expect(manager.get("bg.png")).toBe("blob:nlr/new");
        expect(objectUrls.revoked).toEqual(["blob:nlr/old"]);
    });

    it("survives an environment without decode()", async () => {
        (globalThis as { window?: unknown }).window = { Image: class { public src = ""; } };
        const manager = createManager();
        await preload(manager, "bg.png", true);

        expect(manager.get("bg.png")).toBe(OBJECT_URL);
        expect(manager.isDecoded("bg.png")).toBe(false);
    });
});
