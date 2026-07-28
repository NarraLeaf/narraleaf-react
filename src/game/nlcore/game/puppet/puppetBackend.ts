/**
 * The seam a host uses to draw something the engine does not understand.
 *
 * A puppet is a box on the stage. The engine owns the outside of that box — where it sits, which
 * layer it belongs to, its transform, its opacity, and its place in a saved game — and hands the
 * inside to a backend the host registered. The engine never looks in: `src`, `options`, command
 * names and payloads are opaque values it stores, serialises and forwards untouched.
 *
 * There is exactly one thing the engine will assume about `src`, and only when it is asked to.
 * {@link PuppetMountContext.resolveSibling} reads `src` as a *location* — it takes the part before
 * the last `/` and resolves a path against it. It still does not know what `src` **means**: not the
 * format, not the contents, not which files it will pull in. A backend whose `src` is not a
 * location simply never calls it, and nothing else in the engine does.
 *
 * That is why this module imports nothing but its own string arithmetic. The contract below is the
 * whole of what a renderer has to satisfy, so a host can take these types on their own, and the
 * engine stays free of any renderer's code.
 */

/** Logical pixel size of the box a puppet is drawn into. */
export type PuppetSize = {
    width: number;
    height: number;
};

/**
 * What an editor host sees of a puppet's backend instance.
 *
 * - `unmounted` — the element is not on the stage, or its component has not mounted yet.
 * - `missing-backend` — the element is on the stage, but nothing answers to its `backend` name.
 *   The box still takes part in transforms, layers and saves; it simply draws nothing.
 * - `loading` — the backend was mounted and its {@link PuppetInstance.ready} has not resolved.
 * - `ready` — the first frame has been drawn.
 * - `error` — mounting, applying state, or loading threw. The stage stays alive regardless.
 */
export type PuppetStatus = "unmounted" | "missing-backend" | "loading" | "ready" | "error";

/**
 * The persistent state of a puppet — and the whole of what a saved game carries about one.
 *
 * One-shot actions are deliberately absent: they go through {@link PuppetInstance.command}, so that
 * restoring a puppet is a single {@link PuppetInstance.apply} of a complete state rather than a
 * replay of everything that ever happened to it.
 *
 * None of these names belong to any particular renderer. `motion` / `expression` / `skin` are the
 * three ideas every 2D character renderer has; anything genuinely proprietary belongs in `params`,
 * `slots`, or a command.
 *
 * **What `null` means, field by field.** Every field is a request; `null` is the *absence* of one,
 * and never "leave whatever is there". A state is applied whole, so a field that has been cleared
 * has to visibly clear — otherwise loading a saved game would not reproduce what it recorded, and
 * neither would an undo.
 *
 * A name the model does not have is a {@link PuppetMountContext.warn}, not a throw: throwing out of
 * {@link PuppetInstance.apply} puts the whole element in `"error"` over what is usually one typo.
 */
export type PuppetState = {
    /**
     * The named action currently requested — usually the loop the model settles into.
     *
     * `null` means nothing is playing: the model rests at whatever it looks like with no motion
     * applied — its setup / rest / bind pose, or the backend's own default where the format has no
     * such thing.
     */
    motion: string | null;
    /**
     * The named expression currently requested.
     *
     * `null` means no expression is applied, and the face is whatever the motion and the skin make
     * it. Clear the expression rather than substituting a model's own named "neutral": if the
     * author wants that one, they can name it, and then `null` and `"neutral"` still differ.
     */
    expression: string | null;
    /**
     * The named skin / costume currently requested.
     *
     * `null` means the model's default skin — the one it shows before anybody picks one.
     */
    skin: string | null;
    /**
     * Free numeric parameters.
     *
     * There is no `null` here: a parameter the map does not mention keeps the model's own default
     * for it, so clearing one means dropping the key rather than nulling it.
     */
    params: Record<string, number>;
    /**
     * Free string slots, for whatever the three names above do not cover.
     *
     * A slot set to `null` is cleared — exactly the same state as a key that is not there at all.
     * The key survives only because `setSlot(id, null)` merges over what is already in the map.
     */
    slots: Record<string, string | null>;
};

/**
 * A model describing itself to an editor host.
 *
 * This is what spares a host from parsing model files: it can fill its inspector's dropdowns from
 * the live instance instead. Backends that cannot answer simply do not implement
 * {@link PuppetInstance.describe}, and the host falls back to letting the author type names.
 */
export type PuppetDescription = {
    motions: string[];
    expressions: string[];
    skins: string[];
    params: { id: string; min: number; max: number; default: number }[];
    /** The model's own canvas size, or null when it does not report one. */
    size: PuppetSize | null;
};

/** Everything the engine tells a backend when it mounts one. */
export interface PuppetMountContext {
    /**
     * The resource descriptor the puppet declared, passed through verbatim.
     *
     * Whatever this string means is the backend's business. The engine stores it, saves it and
     * hands it over; the only structure it will ever read out of it is the directory `src` sits in,
     * and only through {@link PuppetMountContext.resolveSibling}.
     */
    readonly src: string;
    /** The author's options for this backend, passed through verbatim. */
    readonly options: Readonly<Record<string, unknown>>;
    /** The logical size of the box, in pixels. Later changes arrive via {@link PuppetInstance.resize}. */
    readonly size: PuppetSize;
    /**
     * Resolve a source to a URL by the same rules images use: a data URI is returned unchanged, and
     * anything else is looked up in the preload cache before being handed back untouched.
     *
     * So this serves whatever the author warmed with `scene.preloadImage()`, and nothing else.
     * **A puppet's own `src` is not registered for preloading** — it is a model manifest, not an
     * image, and the engine has no idea what textures it will pull in. A backend that wants its
     * textures warmed has to have the author warm them by hand; everything not in the cache is a
     * plain URL the backend fetches itself.
     */
    resolveSrc(src: string): string;
    /**
     * Resolve a path that is relative to this puppet's own `src` — a sibling in the same bundle.
     *
     * No real 2D character model is one file. It is a manifest plus an atlas plus texture pages, or
     * a model file plus motions plus physics plus textures, and **which siblings exist is only
     * knowable after parsing the first one**: the manifest names them. So a backend cannot be given
     * a list up front, and asking the author to enumerate one would move parsing to the party least
     * able to do it. It is given the arithmetic instead.
     *
     * The path is resolved against everything in `src` before its last `/`, `.` and `..` are
     * folded, and the result goes through the same rules as {@link PuppetMountContext.resolveSrc} —
     * so a texture the author warmed with `scene.preloadImage()` is served from the preload cache
     * here, and everything else comes back as a plain URL to fetch.
     *
     * ```ts
     * // src: "models/alice/alice.model.json"
     * ctx.resolveSibling("alice.atlas");            // -> "models/alice/alice.atlas"
     * ctx.resolveSibling("textures/page-0.png");    // -> "models/alice/textures/page-0.png"
     * ctx.resolveSibling("../shared/eyes.png");     // -> "models/shared/eyes.png"
     * ctx.resolveSibling("https://cdn/x.png");      // -> unchanged; absolute wins
     * ```
     *
     * A path that is already absolute — a scheme, a leading `/`, a protocol-relative `//host/…`, a
     * data URI — is returned as it stands, because that is what a manifest naming a remote texture
     * means. An empty path resolves to `src` itself. `\` is read as `/`, so a host handing over a
     * native Windows path still gets a usable answer, and the answer always comes back with `/`.
     *
     * The one assumption: that `src` is a location. A backend whose `src` is an opaque key, or a
     * data URI, has no directory to resolve against and gets the path back untouched — such a
     * backend should be reading its own `options` instead, which the engine forwards just as
     * verbatim and where a host can put a map, a base URL, or anything else it likes.
     */
    resolveSibling(relativePath: string): string;
    /** Report a non-fatal problem. The engine logs it and keeps the stage alive; it never throws. */
    warn(message: string, detail?: unknown): void;
}

/**
 * One mounted model. The engine holds this handle and nothing else.
 *
 * Every member below that is not marked optional is **required**: implement all of them. The engine
 * nevertheless checks `ready` and `resize` for existence before calling them, because this object
 * crosses a boundary no compiler watches — it is built by the host, and a plain JavaScript host, or
 * a `PuppetBackend` cast into place, can hand over an object that does not satisfy this contract.
 * Those checks are damage control for a broken backend, not permission to leave the two out.
 *
 * **The order the engine calls these in**, because the first step of it surprises everybody:
 *
 * 1. `mount()` returns this object.
 * 2. `apply()` is called at once with the complete initial state — **before `ready()` is called at
 *    all**, never mind resolved. The first pose therefore arrives while the model is still loading.
 * 3. `ready()` is called once whatever `apply()` returned has settled, and the element reaches
 *    `"ready"` when it resolves.
 * 4. `apply()`, `command()` and `resize()` follow for as long as the element is on stage. Any of
 *    them can arrive before `ready()` has resolved.
 * 5. `dispose()` ends it, at any point, loading included. The engine calls nothing on this object
 *    afterwards.
 *
 * Step 2 is deliberate and is not going to change. A backend wants the pose it is meant to load
 * into *at* load time; gating it on `ready` would buy a tidier contract at the price of every model
 * visibly snapping from its setup pose to the author's pose a frame after it appears. There are two
 * ways to take it and both are fine: hold the state and re-apply it once the model is up, or return
 * a promise from `apply()` that waits for the load — which also holds `ready()` back until the pose
 * has landed, so the element is not called ready before it looks right.
 */
export interface PuppetInstance {
    /** Resolves once the model is loaded and its first frame has been drawn. */
    ready(): Promise<void>;
    /**
     * Apply a **complete** state. Called once on mount, then on every change.
     *
     * The first call comes before `ready()` — see the lifecycle above.
     */
    apply(state: Readonly<PuppetState>): void | Promise<void>;
    /**
     * Run a named command. The engine never interprets `name` or `payload`.
     *
     * Returning a promise lets a caller that opted in wait for the command — playing a motion to
     * its end, for instance. Nothing waits by default.
     */
    command(name: string, payload: unknown): void | Promise<void>;
    /** The box changed size. */
    resize(size: PuppetSize): void;
    /**
     * Optional: describe the model to an editor host. See {@link PuppetDescription}.
     *
     * **Nothing gates this on status.** `DevTools.describePuppet` forwards it the moment it is
     * asked, which is any time between `mount` and `dispose` — before `ready()` has resolved, and
     * more than once. That is the design, not an oversight: an editor opens an inspector when the
     * author clicks, not when a model happens to have finished loading, and a backend knows better
     * than the engine what it can answer and when. So a backend that can only describe a loaded
     * model awaits its own load in here. Rejecting is safe too — the host logs it and falls back to
     * letting the author type names.
     */
    describe?(): Promise<PuppetDescription>;
    dispose(): void;
}

/** A drawing backend registered by the host. The engine knows nothing of its internals. */
export interface PuppetBackend {
    /** The key a puppet's `backend` config refers to. */
    readonly name: string;
    /**
     * Create an instance bound to a host element.
     *
     * The engine owns the box (position / scale / opacity / rotation / layer); the backend owns
     * what is inside it. The container is emptied when the instance is disposed.
     */
    mount(container: HTMLDivElement, ctx: PuppetMountContext): PuppetInstance;
}

/** A leading scheme (`https:`, `data:`, and a bare Windows drive letter with it), or a root `/`. */
const ABSOLUTE = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/)/;
/** `scheme://authority/`, or the protocol-relative `//authority/` — the part `..` must not eat. */
const ORIGIN = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:)?\/\/[^/]*\/?/;

/**
 * Resolve `relativePath` against the directory `src` sits in.
 *
 * This is the whole of {@link PuppetMountContext.resolveSibling} bar the final `resolveSrc` pass,
 * kept as a pure function so it can be tested without a stage. See that member for the contract; the
 * rules it states are the ones enforced here.
 *
 * @internal
 */
export function resolvePuppetSibling(src: string, relativePath: string): string {
    if (typeof relativePath !== "string" || !relativePath.length) {
        return src;
    }
    // A manifest naming a remote or root-anchored file means exactly that; there is nothing to
    // resolve. This is also the branch that keeps a data URI in a manifest intact.
    if (ABSOLUTE.test(relativePath)) {
        return relativePath;
    }
    // A data URI is a payload, not a location: it has no directory, and its body is full of
    // characters that would make "everything before the last slash" nonsense.
    if (typeof src !== "string" || src.startsWith("data:")) {
        return relativePath;
    }

    const [origin, rest] = splitOrigin(src.replace(/\\/g, "/"));
    // A query and a fragment belong to `src` itself, not to the directory it lives in.
    const path = rest.replace(/[?#].*$/, "");
    const directory = path.slice(0, path.lastIndexOf("/") + 1);

    return origin + normalizeSegments(directory + relativePath.replace(/\\/g, "/"));
}

/** Split off the part of a location that path arithmetic must not touch. */
function splitOrigin(src: string): [origin: string, rest: string] {
    const authority = ORIGIN.exec(src);
    if (authority) {
        return [authority[0], src.slice(authority[0].length)];
    }
    if (src.startsWith("/")) {
        return ["/", src.slice(1)];
    }
    return ["", src];
}

/** Fold `.` and `..` away, clamping at the root rather than climbing out of it. */
function normalizeSegments(path: string): string {
    const parts = path.split("/");
    const segments: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // An empty part is a doubled slash, except at the end, where it is a trailing one worth
        // keeping — a backend may well be resolving a directory.
        if (part === "." || (part === "" && i !== parts.length - 1)) {
            continue;
        }
        if (part === "..") {
            segments.pop();
            continue;
        }
        segments.push(part);
    }
    return segments.join("/");
}

/**
 * The backends one {@link import("@core/game").Game} knows about.
 *
 * @internal
 */
export class PuppetBackendRegistry {
    private readonly backends = new Map<string, PuppetBackend>();
    private readonly reportedMissing = new Set<string>();

    /** Register a backend. A later registration under the same name replaces the earlier one. */
    public register(backend: PuppetBackend): this {
        if (!backend || typeof backend.name !== "string" || !backend.name.length) {
            throw new Error("A puppet backend must have a non-empty name.");
        }
        if (typeof backend.mount !== "function") {
            throw new Error(`Puppet backend "${backend.name}" must implement mount().`);
        }
        this.backends.set(backend.name, backend);
        // A name that was missing before now resolves; let it be reported again if it is removed.
        this.reportedMissing.delete(backend.name);
        return this;
    }

    public get(name: string): PuppetBackend | null {
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
     * Users bring their own renderers, so someone will always forget to register one; a stage full
     * of puppets must not turn that into a wall of identical warnings.
     *
     * @returns whether this call was the one that reported it.
     */
    public reportMissing(name: string, warn: (message: string) => void): boolean {
        if (this.reportedMissing.has(name)) {
            return false;
        }
        this.reportedMissing.add(name);
        warn(
            `No puppet backend is registered under "${name}". `
            + "The element keeps its place on the stage, its transform and its saved state, but draws nothing. "
            + "Register one with game.registerPuppetBackend({name, mount}) before the game mounts."
        );
        return true;
    }
}
