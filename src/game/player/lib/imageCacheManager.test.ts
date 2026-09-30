import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageCacheManager } from "@player/lib/ImageCacheManager";

const MB = 1024 * 1024;

/** Object URLs handed out and taken back, so leaks show up as an assertion rather than as memory. */
const objectUrls = { created: [] as string[], revoked: [] as string[] };
/** Which source each minted object url stands for, so a fake decode knows its own dimensions. */
const minted = new Map<string, string>();
/** Bitmap sizes by source, in pixels; a source not listed decodes to nothing. */
const bitmaps = new Map<string, [width: number, height: number]>();
/** File sizes by source, in bytes. */
const files = new Map<string, number>();

/** Records what was decoded and through which element, so retention can be asserted. */
class FakeImage {
    static decoded: string[] = [];
    /** When set, decodes hang here until the test releases them. */
    static gate: (() => void) | null = null;
    public src = "";
    public naturalWidth = 0;
    public naturalHeight = 0;

    decode(): Promise<void> {
        FakeImage.decoded.push(this.src);
        const [width, height] = bitmaps.get(minted.get(this.src) ?? "") ?? [0, 0];
        this.naturalWidth = width;
        this.naturalHeight = height;
        if (!FakeImage.gate) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            FakeImage.gate = resolve;
        });
    }
}

type Budget = { blob?: number; decoded?: number };

function createManager(budget: Budget = {}) {
    const game = {
        addSideEffect: vi.fn(),
        hooks: { rawTrigger: vi.fn() },
        config: {
            imageCacheBudgetBytes: budget.blob ?? Infinity,
            decodedImageBudgetBytes: budget.decoded ?? Infinity,
        },
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

/** A 1080p background: 8 MB decoded whatever its file size. */
function background(name: string, fileBytes = 2 * MB): string {
    bitmaps.set(name, [1920, 1080]);
    files.set(name, fileBytes);
    return name;
}

const BACKGROUND_BYTES = 1920 * 1080 * 4;

/** The object url the cache minted for `name`, or `undefined` when it never fetched it. */
function urlOf(name: string): string | undefined {
    for (const [url, source] of minted) {
        if (source === name) {
            return url;
        }
    }
    return undefined;
}

describe("ImageCacheManager", () => {
    beforeEach(() => {
        FakeImage.decoded = [];
        FakeImage.gate = null;
        objectUrls.created = [];
        objectUrls.revoked = [];
        minted.clear();
        bitmaps.clear();
        files.clear();
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
        vi.spyOn(ImageCacheManager, "getImage").mockImplementation(async (src: string) => {
            const url = `blob:nlr/${objectUrls.created.length}`;
            objectUrls.created.push(url);
            minted.set(url, src);
            return { url, bytes: files.get(src) ?? 0 };
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as { window?: unknown }).window;
        delete (globalThis as { URL?: unknown }).URL;
    });

    describe("decoded retention", () => {
        it("decodes against the object url that will be assigned to <img src>", async () => {
            const manager = createManager();
            await preload(manager, "bg.png", true);

            expect(manager.get("bg.png")).toBe(urlOf("bg.png"));
            expect(FakeImage.decoded).toEqual([urlOf("bg.png")]);
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
            expect(FakeImage.decoded).toEqual([urlOf("far-away.png")]);
            expect(manager.isDecoded("far-away.png")).toBe(false);
            expect(manager.has("far-away.png")).toBe(true);
        });

        it("releases retained bitmaps when the src is evicted", async () => {
            const manager = createManager();
            await preload(manager, "bg.png", true);

            manager.retain(["something-else.png"]);
            expect(manager.has("bg.png")).toBe(false);
            expect(manager.isDecoded("bg.png")).toBe(false);
            // An object URL pins its blob until it is revoked, so eviction has to hand it back.
            expect(objectUrls.revoked).toEqual([urlOf("bg.png")]);
        });

        it("releases retained bitmaps on remove and clear", async () => {
            const manager = createManager();
            await preload(manager, "a.png", true);
            manager.remove("a.png");
            expect(manager.isDecoded("a.png")).toBe(false);
            expect(objectUrls.revoked).toEqual([urlOf("a.png")]);

            await preload(manager, "b.png", true);
            manager.clear();
            expect(manager.isDecoded("b.png")).toBe(false);
            expect(objectUrls.revoked).toEqual([urlOf("a.png"), urlOf("b.png")]);
            expect(manager.getStats()).toMatchObject({ entries: 0, blobBytes: 0, decodedBytes: 0 });
        });

        it("revokes an object url the cache dropped while its decode was still in flight", async () => {
            const manager = createManager();
            // A held decode stands in for the real gap between caching a url and holding its bitmap.
            FakeImage.gate = () => undefined;
            const finished = preload(manager, "bg.png", true);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            // A scene change lands in that gap. The entry is gone, and the url this pass minted is
            // owned by nobody - nothing else would ever hand it back.
            manager.retain([]);
            expect(objectUrls.revoked).toEqual([urlOf("bg.png")]);
            const release = FakeImage.gate as unknown as () => void;
            release();
            await finished;

            expect(manager.has("bg.png")).toBe(false);
            expect(manager.isDecoded("bg.png")).toBe(false);
            // Twice: the eviction hands it back, and so does the landing decode, which cannot tell
            // whether the entry it was filling was dropped or replaced. Revoking a url that is already
            // gone is a no-op, and the alternative - trusting whoever got there first - leaks whenever
            // the eviction is the one that loses the race.
            expect(objectUrls.revoked).toEqual([urlOf("bg.png"), urlOf("bg.png")]);
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

            expect(manager.get("bg.png")).toBe(urlOf("bg.png"));
            expect(manager.isDecoded("bg.png")).toBe(false);
        });
    });

    describe("budget", () => {
        it("accounts the bytes it fetched and the bitmaps it holds", async () => {
            const manager = createManager({ blob: 100 * MB, decoded: 50 * MB });
            await preload(manager, background("a.png", 3 * MB), true);
            await preload(manager, background("b.png", 1 * MB), false);

            expect(manager.getStats()).toEqual({
                entries: 2,
                blobBytes: 4 * MB,
                decodedEntries: 1,
                decodedBytes: BACKGROUND_BYTES,
                pinned: 0,
                budget: { blobBytes: 100 * MB, decodedBytes: 50 * MB },
            });
        });

        it("lets the least recently used bitmap go first past the decoded budget, and keeps its bytes", async () => {
            // Room for two backgrounds' bitmaps, not three.
            const manager = createManager({ decoded: 2 * BACKGROUND_BYTES });
            await preload(manager, background("a.png"), true);
            await preload(manager, background("b.png"), true);
            await preload(manager, background("c.png"), true);

            expect(manager.isDecoded("a.png")).toBe(false);
            expect(manager.isDecoded("b.png")).toBe(true);
            expect(manager.isDecoded("c.png")).toBe(true);
            // The bytes are still cached: only the bitmap went, to be decoded again on demand.
            expect(manager.has("a.png")).toBe(true);
            expect(objectUrls.revoked).toEqual([]);
            expect(manager.getStats()).toMatchObject({ decodedEntries: 2, decodedBytes: 2 * BACKGROUND_BYTES });
        });

        it("counts a read as a use, so what the stage just asked for outlives what it did not", async () => {
            const manager = createManager({ decoded: 2 * BACKGROUND_BYTES });
            await preload(manager, background("a.png"), true);
            await preload(manager, background("b.png"), true);
            manager.get("a.png");
            await preload(manager, background("c.png"), true);

            expect(manager.isDecoded("a.png")).toBe(true);
            expect(manager.isDecoded("b.png")).toBe(false);
        });

        it("releases whole entries, oldest first, past the fetched budget", async () => {
            const manager = createManager({ blob: 2.5 * MB });
            await preload(manager, background("a.png", 1 * MB), false);
            await preload(manager, background("b.png", 1 * MB), false);
            await preload(manager, background("c.png", 1 * MB), false);

            expect(manager.has("a.png")).toBe(false);
            expect(manager.has("b.png")).toBe(true);
            expect(manager.has("c.png")).toBe(true);
            expect(objectUrls.revoked).toEqual([urlOf("a.png")]);
            expect(manager.getStats()).toMatchObject({ entries: 2, blobBytes: 2 * MB });
        });

        it("does not keep an entry that is over the budget on its own unless something pins it", async () => {
            const manager = createManager({ blob: 1 * MB });
            await preload(manager, background("huge.png", 2 * MB), true);
            expect(manager.has("huge.png")).toBe(false);
            expect(objectUrls.revoked).toEqual([urlOf("huge.png")]);
            // Nothing was decoded for an entry the budget took straight back.
            expect(FakeImage.decoded).toEqual([]);

            manager.pin(["frame.png"]);
            await preload(manager, background("frame.png", 2 * MB), true);
            expect(manager.has("frame.png")).toBe(true);
            expect(manager.isDecoded("frame.png")).toBe(true);
        });

        it("never evicts what a mounted <img> is showing, and lets it go once nothing does", async () => {
            const manager = createManager({ blob: 2.5 * MB });
            await preload(manager, background("a.png", 1 * MB), false);
            manager.hold(urlOf("a.png")!);
            await preload(manager, background("b.png", 1 * MB), false);
            await preload(manager, background("c.png", 1 * MB), false);

            // `a` is the oldest and would have gone first; being on stage, `b` went instead.
            expect(manager.has("a.png")).toBe(true);
            expect(manager.has("b.png")).toBe(false);
            expect(manager.getStats()).toMatchObject({ pinned: 1 });

            // The <img> unmounts. Nothing is over budget at this moment, so nothing has to go - but
            // `a` is an ordinary entry again, and the oldest one, so the next thing that needs room
            // takes it rather than what is on stage now.
            manager.release(urlOf("a.png")!);
            expect(manager.getStats()).toMatchObject({ pinned: 0 });
            await preload(manager, background("d.png", 1 * MB), false);
            expect(manager.has("a.png")).toBe(false);
            expect(manager.has("c.png")).toBe(true);
            expect(manager.has("d.png")).toBe(true);
        });

        it("counts every <img> showing a url, and only the last release lets it go", async () => {
            const manager = createManager({ decoded: 1 * BACKGROUND_BYTES });
            await preload(manager, background("a.png"), true);
            const url = urlOf("a.png")!;
            manager.hold(url);
            manager.hold(url);
            await preload(manager, background("b.png"), true);
            // Two <img>s show `a`, so `b`'s bitmap went instead of the one on screen.
            expect(manager.isDecoded("a.png")).toBe(true);
            expect(manager.isDecoded("b.png")).toBe(false);

            manager.release(url);
            expect(manager.getStats()).toMatchObject({ pinned: 1 });
            manager.release(url);
            expect(manager.getStats()).toMatchObject({ pinned: 0 });

            // Unpinned and least recently used: now it is the bitmap the budget takes.
            await preload(manager, background("c.png"), true);
            expect(manager.isDecoded("a.png")).toBe(false);
            expect(manager.isDecoded("c.png")).toBe(true);
        });

        it("never evicts the scene's pinned first frame", async () => {
            const manager = createManager({ blob: 2.5 * MB, decoded: 1 * BACKGROUND_BYTES });
            manager.pin(["opening.png"]);
            await preload(manager, background("opening.png", 1 * MB), true);
            await preload(manager, background("b.png", 1 * MB), true);
            await preload(manager, background("c.png", 1 * MB), true);

            expect(manager.has("opening.png")).toBe(true);
            expect(manager.isDecoded("opening.png")).toBe(true);
            expect(manager.has("b.png")).toBe(false);
            expect(manager.isDecoded("c.png")).toBe(false);

            // The next scene pins its own frame and names its own plan. The old opening is an
            // ordinary entry again, and outside the new plan it goes with the rest of what was left.
            manager.pin(["c.png"]);
            expect(manager.getStats()).toMatchObject({ pinned: 1 });
            expect(manager.isDecoded("c.png")).toBe(false);
            manager.retain(["c.png"]);
            expect(manager.has("opening.png")).toBe(false);
            expect(manager.has("c.png")).toBe(true);
        });

        it("ignores a hold on a url it never minted", async () => {
            const manager = createManager({ blob: 1.5 * MB });
            manager.hold("https://example.com/raw.png");
            await preload(manager, background("a.png", 1 * MB), false);
            await preload(manager, background("b.png", 1 * MB), false);

            expect(manager.has("a.png")).toBe(false);
            expect(manager.getStats()).toMatchObject({ pinned: 0 });
            manager.release("https://example.com/raw.png");
            manager.release("https://example.com/raw.png");
            expect(manager.has("b.png")).toBe(true);
        });

        it("keeps nothing decoded beyond the pins at a budget of 0, and everything at Infinity", async () => {
            const bounded = createManager({ decoded: 0 });
            bounded.pin(["opening.png"]);
            await preload(bounded, background("opening.png"), true);
            await preload(bounded, background("a.png"), true);
            expect(bounded.isDecoded("opening.png")).toBe(true);
            expect(bounded.isDecoded("a.png")).toBe(false);
            expect(bounded.has("a.png")).toBe(true);

            const unbounded = createManager();
            for (let i = 0; i < 40; i++) {
                await preload(unbounded, background(`bg-${i}.png`), true);
            }
            expect(unbounded.getStats()).toMatchObject({
                decodedEntries: 40,
                decodedBytes: 40 * BACKGROUND_BYTES,
                budget: { blobBytes: Infinity, decodedBytes: Infinity },
            });
        });
    });

    describe("scene residency", () => {
        it("drops what the scene has no use for at once", async () => {
            const manager = createManager();
            await preload(manager, background("left.png", 1 * MB), true);
            await preload(manager, background("next.png", 1 * MB), false);

            manager.retain(["next.png", "later.png"]);

            expect(manager.has("left.png")).toBe(false);
            expect(manager.has("next.png")).toBe(true);
            expect(objectUrls.revoked).toEqual([urlOf("left.png")]);
            expect(manager.getStats()).toMatchObject({ entries: 1, blobBytes: 1 * MB, decodedBytes: 0 });
        });

        it("keeps a left scene's image while an <img> still shows it, and drops it the moment none does", async () => {
            const manager = createManager();
            await preload(manager, background("left.png", 1 * MB), true);
            const url = urlOf("left.png")!;
            manager.hold(url);

            // The next scene's pass starts while the transition is still showing the old scene.
            manager.retain(["next.png"]);
            expect(manager.has("left.png")).toBe(true);
            expect(manager.isDecoded("left.png")).toBe(true);
            expect(objectUrls.revoked).toEqual([]);

            // scene:exit unmounts the old scene's <img>.
            manager.release(url);
            expect(manager.has("left.png")).toBe(false);
            expect(manager.isDecoded("left.png")).toBe(false);
            expect(objectUrls.revoked).toEqual([url]);
            expect(manager.getStats()).toMatchObject({ entries: 0, blobBytes: 0, decodedBytes: 0 });
        });

        it("forgets that an image was stale once a plan wants it again", async () => {
            const manager = createManager();
            await preload(manager, background("shared.png", 1 * MB), true);
            const url = urlOf("shared.png")!;
            manager.hold(url);
            manager.retain([]);
            // A scene call returned: the caller's pass runs again with its own plan.
            manager.retain(["shared.png"]);
            manager.release(url);

            expect(manager.has("shared.png")).toBe(true);
            expect(objectUrls.revoked).toEqual([]);
        });

        it("remembers that it once held an image the budget has since released", async () => {
            const manager = createManager({ blob: 1.5 * MB });
            await preload(manager, background("a.png", 1 * MB), false);
            await preload(manager, background("b.png", 1 * MB), false);

            // What the stage asks for now is the difference between "nobody predicted this image",
            // which is worth telling the author about, and "the cache had it and let it go".
            expect(manager.has("a.png")).toBe(false);
            expect(manager.wasCached("a.png")).toBe(true);
            expect(manager.wasCached("never-asked-for.png")).toBe(false);

            manager.clear();
            expect(manager.wasCached("a.png")).toBe(false);
        });

        it("keeps the pinned first frame out of a retain that does not name it", async () => {
            const manager = createManager();
            manager.pin(["opening.png"]);
            await preload(manager, background("opening.png", 1 * MB), true);
            manager.retain([]);

            expect(manager.has("opening.png")).toBe(true);
            manager.pin([]);
            expect(manager.has("opening.png")).toBe(true);
            // Stale and unpinned now, but nothing runs until a hold is released or a budget is hit.
            manager.retain([]);
            expect(manager.has("opening.png")).toBe(false);
        });
    });

    describe("asking again", () => {
        it("decodes a cached image again when retention is asked for after the fact", async () => {
            const manager = createManager();
            await preload(manager, background("bg.png"), false);
            expect(manager.isDecoded("bg.png")).toBe(false);

            await preload(manager, "bg.png", true);

            expect(manager.isDecoded("bg.png")).toBe(true);
            // Decoded twice, fetched once: the bytes were already there.
            expect(FakeImage.decoded).toEqual([urlOf("bg.png"), urlOf("bg.png")]);
            expect(ImageCacheManager.getImage).toHaveBeenCalledTimes(1);
        });

        it("re-warms a bitmap the budget let go of, so a first frame still gates on a decode", async () => {
            const manager = createManager({ decoded: 1 * BACKGROUND_BYTES });
            await preload(manager, background("a.png"), true);
            await preload(manager, background("b.png"), true);
            expect(manager.isDecoded("a.png")).toBe(false);

            manager.pin(["a.png"]);
            await preload(manager, "a.png", true);

            expect(manager.isDecoded("a.png")).toBe(true);
            expect(manager.isDecoded("b.png")).toBe(false);
        });

        it("settles at once for an image that is already warm, without another decode", async () => {
            const manager = createManager();
            await preload(manager, background("bg.png"), true);
            FakeImage.decoded = [];

            await preload(manager, "bg.png", true);
            await preload(manager, "bg.png", false);

            expect(FakeImage.decoded).toEqual([]);
            expect(ImageCacheManager.getImage).toHaveBeenCalledTimes(1);
        });

        it("follows a fetch already in flight instead of handing out a token that never fires", async () => {
            const manager = createManager();
            let land: (value: { url: string; bytes: number }) => void = () => undefined;
            vi.spyOn(ImageCacheManager, "getImage").mockImplementation(() => new Promise(resolve => {
                land = resolve;
            }));

            const lookAhead = preload(manager, "bg.png", false);
            expect(manager.isPreloading("bg.png")).toBe(true);
            // The next scene wants the same image, decoded and held this time.
            const firstFrame = preload(manager, "bg.png", true);
            await Promise.resolve();

            land({ url: "blob:nlr/shared", bytes: 1 * MB });
            minted.set("blob:nlr/shared", background("bg.png"));
            await Promise.all([lookAhead, firstFrame]);

            expect(ImageCacheManager.getImage).toHaveBeenCalledTimes(1);
            expect(manager.has("bg.png")).toBe(true);
            expect(manager.isDecoded("bg.png")).toBe(true);
            expect(manager.getStats()).toMatchObject({ entries: 1, blobBytes: 1 * MB, decodedBytes: BACKGROUND_BYTES });
        });

        it("reports a failed fetch to every follower and fetches it once", async () => {
            const manager = createManager();
            vi.spyOn(ImageCacheManager, "getImage").mockRejectedValue(new Error("404"));
            const errors: unknown[] = [];
            const finished: string[] = [];

            const first = manager.preload(stateLike, "missing.png", { retainDecoded: true })
                .onErrored(reason => errors.push(reason))
                .onFinished(() => finished.push("first"));
            const second = manager.preload(stateLike, "missing.png", { retainDecoded: true })
                .onErrored(reason => errors.push(reason))
                .onFinished(() => finished.push("second"));
            void first;
            void second;
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(errors).toHaveLength(2);
            expect(finished.sort()).toEqual(["first", "second"]);
            expect(ImageCacheManager.getImage).toHaveBeenCalledTimes(1);
            expect(manager.has("missing.png")).toBe(false);
            expect(manager.isPreloading("missing.png")).toBe(false);
        });
    });
});
