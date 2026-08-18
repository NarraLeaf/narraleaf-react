/**
 * The seam a host uses to draw an image the engine has resolved but cannot present itself.
 *
 * This is the puppet seam's sibling, and the difference between the two is the whole point.
 *
 * A **puppet** is a box whose contents the engine knows nothing about: `src` and `options` are
 * opaque, and what the box shows is whatever the backend decides from state the engine only stores
 * (`motion`, `expression`, `skin`, …). An **image with a backend** is the other half: the engine
 * still owns everything it always owned about an image — which tag group is selected, which layers
 * that resolves to, which URLs those are, and their place in the preloader — and hands the
 * *resolved sources* to a host that decides how they are presented.
 *
 * That is what makes it worth having. A host that wants a character shown inside its own frame —
 * clipped, decorated, laid out by its own editor — would otherwise have to re-resolve the
 * character's appearance on its own side, and then two implementations of "what does this character
 * look like right now" would drift. With this, there is still exactly one: the engine's.
 *
 * What the host gets is deliberately narrow: URLs, a box size, and its own opaque options. What it
 * does not get is any way to change what the image is showing — a source change is a story's
 * business, arrives through {@link ImageBackendInstance.apply}, and is never pushed back.
 *
 * Like the puppet seam, this module imports nothing. The contract below is the whole of what a host
 * has to satisfy, so it can be taken on its own and the engine stays free of any host's code.
 */

/** Logical pixel size of the box a host-drawn image is given. */
export type ImageBackendSize = {
    width: number;
    height: number;
};

/**
 * What an editor host sees of a host-drawn image's backend instance. Same vocabulary, same
 * guarantees, as a puppet's — an element whose backend is missing or broken keeps its place on the
 * stage, its transform and its saved state, and draws nothing.
 */
export type ImageBackendStatus = "unmounted" | "missing-backend" | "loading" | "ready" | "error";

/**
 * What the image is showing, as the engine resolved it.
 *
 * `srcs` is ordered bottom to top and already resolved through the preload cache, so a host can
 * attach a URL to an `<img>` and have it paint without a decode. It is a list rather than a single
 * URL because a layered image is genuinely several pictures stacked on one canvas; a plain image
 * hands over a list of one, so a host never has to care which kind it was given.
 *
 * A `null` entry is a layer that draws nothing at the current selection. It is kept rather than
 * filtered out so that the list index still identifies the layer, which is what lets a host hold
 * per-layer state (a mask, an offset) across a change of selection.
 *
 * `colour` is the one non-picture an image can be — a background painted as a flat colour. A host
 * that has no use for it can ignore it; one that draws frames will usually want to fill with it.
 */
export type ImageBackendContent = {
    srcs: (string | null)[];
    colour: string | null;
};

/** Everything the engine tells a backend when it mounts one. */
export interface ImageBackendMountContext {
    /** What to draw right now. Superseded by every {@link ImageBackendInstance.apply}. */
    content: ImageBackendContent;
    /** The box, in logical pixels. */
    size: ImageBackendSize;
    /** The element's opaque options, passed through verbatim from its config. */
    options: Record<string, unknown> | undefined;
    /**
     * The engine's id for this element, stable across a save and a load.
     *
     * A host that keeps state of its own per element — an editor selection, a scoped store — keys
     * it on this rather than on the mount, which happens again on every load.
     */
    elementId: string;
    /**
     * Resolve any other URL through the same preload cache the engine used for {@link content}.
     *
     * A host drawing decoration of its own (a frame, a mask) can warm it the same way rather than
     * fetching around the engine.
     */
    resolveSrc: (src: string) => string;
    /** Report a problem without taking the stage down. */
    warn: (message: string, detail?: unknown) => void;
}

/** What a backend hands back, and the whole of what the engine will call on it. */
export interface ImageBackendInstance {
    /**
     * Resolves once the first frame has been drawn. A backend that paints synchronously may leave
     * it out; the element is then `ready` as soon as it is mounted.
     */
    ready?: () => Promise<void>;
    /**
     * The image is now showing something else — a different tag selection, a different source, a
     * transition that has settled.
     *
     * Applied whole, like a puppet's state: what arrives is everything the element is showing, not
     * a diff, so restoring a saved game is one call rather than a replay.
     */
    apply?: (content: ImageBackendContent) => void;
    /** The box changed size. */
    resize?: (size: ImageBackendSize) => void;
    /** The element left the stage. Everything the backend allocated is released here. */
    dispose?: () => void;
}

/** A host-registered presenter for images that name it. */
export interface ImageBackend {
    /** The name an image's `backend` refers to. */
    name: string;
    mount(container: HTMLElement, ctx: ImageBackendMountContext): ImageBackendInstance;
}

/**
 * The backends a game knows, by name.
 *
 * Deliberately a near-copy of `PuppetBackendRegistry` rather than a shared generic one: the two
 * seams hand over different things and will grow apart, and one registry pretending they are the
 * same would have to be widened every time either of them moves.
 */
export class ImageBackendRegistry {
    private readonly backends = new Map<string, ImageBackend>();
    private readonly reportedMissing = new Set<string>();

    /** Register a backend. A later registration under the same name replaces the earlier one. */
    public register(backend: ImageBackend): this {
        if (!backend || typeof backend.name !== "string" || !backend.name.length) {
            throw new Error("An image backend must have a non-empty name.");
        }
        if (typeof backend.mount !== "function") {
            throw new Error(`Image backend "${backend.name}" must implement mount().`);
        }
        this.backends.set(backend.name, backend);
        this.reportedMissing.delete(backend.name);
        return this;
    }

    public get(name: string): ImageBackend | null {
        return this.backends.get(name) || null;
    }

    public has(name: string): boolean {
        return this.backends.has(name);
    }

    public list(): string[] {
        return Array.from(this.backends.keys());
    }

    public unregister(name: string): boolean {
        return this.backends.delete(name);
    }

    /**
     * Report a backend nothing answers to, at most once per name.
     *
     * @returns whether this call was the one that reported it.
     */
    public reportMissing(name: string, warn: (message: string) => void): boolean {
        if (this.reportedMissing.has(name)) {
            return false;
        }
        this.reportedMissing.add(name);
        warn(
            `No image backend is registered under "${name}". `
            + "The element keeps its place on the stage, its transform and its saved state, but draws nothing. "
            + "Register one with game.registerImageBackend({name, mount}) before the game mounts."
        );
        return true;
    }
}
