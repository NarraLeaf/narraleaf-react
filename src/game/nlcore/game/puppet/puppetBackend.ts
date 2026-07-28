/**
 * The seam a host uses to draw something the engine does not understand.
 *
 * A puppet is a box on the stage. The engine owns the outside of that box — where it sits, which
 * layer it belongs to, its transform, its opacity, and its place in a saved game — and hands the
 * inside to a backend the host registered. The engine never looks in: `src`, `options`, command
 * names and payloads are opaque values it stores, serialises and forwards untouched.
 *
 * That is why this module imports nothing. The contract below is the whole of what a renderer has
 * to satisfy, so a host can take these types on their own, and the engine stays free of any
 * renderer's code.
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
 */
export type PuppetState = {
    /** The named action currently requested (usually an idle loop), or null. */
    motion: string | null;
    /** The named expression currently requested, or null. */
    expression: string | null;
    /** The named skin / costume currently requested, or null. */
    skin: string | null;
    /** Free numeric parameters. */
    params: Record<string, number>;
    /** Free string slots, for whatever the three names above do not cover. */
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
    /** The resource descriptor the puppet declared, passed through verbatim. */
    readonly src: string;
    /** The author's options for this backend, passed through verbatim. */
    readonly options: Readonly<Record<string, unknown>>;
    /** The logical size of the box, in pixels. Later changes arrive via {@link PuppetInstance.resize}. */
    readonly size: PuppetSize;
    /**
     * Resolve a relative source to a URL by the same rules images use — so anything warmed with
     * `scene.preloadImage()` is served from the preload cache rather than fetched again.
     */
    resolveSrc(src: string): string;
    /** Report a non-fatal problem. The engine logs it and keeps the stage alive; it never throws. */
    warn(message: string, detail?: unknown): void;
}

/** One mounted model. The engine holds this handle and nothing else. */
export interface PuppetInstance {
    /** Resolves once the model is loaded and its first frame has been drawn. */
    ready(): Promise<void>;
    /** Apply a **complete** state. Called once on mount, then on every change. */
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
    /** Optional: describe the model to an editor host. See {@link PuppetDescription}. */
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
