import { describe, expect, it, vi } from "vitest";
import { PuppetBackendRegistry, resolvePuppetSibling } from "@core/game/puppet/puppetBackend";
import type { PuppetBackend, PuppetInstance } from "@core/game/puppet/puppetBackend";

function backend(name: string, mount?: PuppetBackend["mount"]): PuppetBackend {
    return {
        name,
        mount: mount || (() => ({
            ready: () => Promise.resolve(),
            apply: () => undefined,
            command: () => undefined,
            resize: () => undefined,
            dispose: () => undefined,
        } satisfies PuppetInstance)),
    };
}

describe("PuppetBackendRegistry", () => {
    describe("registration", () => {
        it("returns null for a name nothing was registered under", () => {
            const registry = new PuppetBackendRegistry();
            expect(registry.get("nobody")).toBeNull();
            expect(registry.has("nobody")).toBe(false);
        });

        it("resolves a registered backend and lists it in registration order", () => {
            const registry = new PuppetBackendRegistry();
            const first = backend("first"), second = backend("second");

            registry.register(first).register(second);

            expect(registry.get("first")).toBe(first);
            expect(registry.get("second")).toBe(second);
            expect(registry.list()).toEqual(["first", "second"]);
        });

        it("replaces a backend registered under a name already taken", () => {
            const registry = new PuppetBackendRegistry();
            const original = backend("shared"), replacement = backend("shared");

            registry.register(original).register(replacement);

            expect(registry.get("shared")).toBe(replacement);
            expect(registry.list()).toEqual(["shared"]);
        });

        it("rejects a backend without a usable name or mount", () => {
            const registry = new PuppetBackendRegistry();
            expect(() => registry.register({ name: "", mount: () => null as never })).toThrow(/name/);
            expect(() => registry.register({ name: "x" } as never)).toThrow(/mount/);
        });

        it("unregister removes the backend and reports whether there was one", () => {
            const registry = new PuppetBackendRegistry();
            registry.register(backend("gone"));

            expect(registry.unregister("gone")).toBe(true);
            expect(registry.unregister("gone")).toBe(false);
            expect(registry.get("gone")).toBeNull();
        });
    });

    describe("missing-backend degradation", () => {
        it("reports a missing backend once per name", () => {
            const registry = new PuppetBackendRegistry();
            const warn = vi.fn();

            expect(registry.reportMissing("absent", warn)).toBe(true);
            expect(registry.reportMissing("absent", warn)).toBe(false);
            expect(registry.reportMissing("absent", warn)).toBe(false);

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain("absent");
        });

        // This is the shape of the whole degradation, and the reason it has a test of its own: it
        // is what protects a shipped game whose author forgot to install the renderer. Nothing here
        // throws, and the message has to tell whoever reads the console both that the element is
        // still on stage and how to fix it.
        it("resolves to nothing, warns once, and never throws", () => {
            const registry = new PuppetBackendRegistry();
            const warn = vi.fn();

            expect(registry.get("forgotten")).toBeNull();
            expect(() => registry.reportMissing("forgotten", warn)).not.toThrow();

            const [message] = warn.mock.calls[0];
            expect(message).toContain("keeps its place on the stage");
            expect(message).toContain("draws nothing");
            expect(message).toContain("registerPuppetBackend");
        });

        it("reports each missing name separately", () => {
            const registry = new PuppetBackendRegistry();
            const warn = vi.fn();

            registry.reportMissing("a", warn);
            registry.reportMissing("b", warn);
            registry.reportMissing("a", warn);

            expect(warn).toHaveBeenCalledTimes(2);
        });

        it("lets a name be reported again after a backend for it is registered and removed", () => {
            const registry = new PuppetBackendRegistry();
            const warn = vi.fn();

            registry.reportMissing("late", warn);
            registry.register(backend("late"));
            registry.unregister("late");
            registry.reportMissing("late", warn);

            expect(warn).toHaveBeenCalledTimes(2);
        });
    });
});

describe("resolvePuppetSibling", () => {
    // A model is a bundle, and its manifest names the rest of the bundle by paths relative to
    // itself. Every one of these is a shape that actually turns up in one.
    const manifest = "models/alice/alice.model.json";

    it("resolves a plain sibling against the manifest's own directory", () => {
        expect(resolvePuppetSibling(manifest, "alice.atlas")).toBe("models/alice/alice.atlas");
        expect(resolvePuppetSibling(manifest, "textures/page-0.png"))
            .toBe("models/alice/textures/page-0.png");
    });

    it("folds away `.` and `..`, and clamps rather than climbing out of the root", () => {
        expect(resolvePuppetSibling(manifest, "./alice.atlas")).toBe("models/alice/alice.atlas");
        expect(resolvePuppetSibling(manifest, "../shared/eyes.png")).toBe("models/shared/eyes.png");
        expect(resolvePuppetSibling(manifest, "motions/../physics.json"))
            .toBe("models/alice/physics.json");
        expect(resolvePuppetSibling(manifest, "../../../../../etc/passwd")).toBe("etc/passwd");
    });

    it("keeps the origin of an absolute src out of the path arithmetic", () => {
        expect(resolvePuppetSibling("https://cdn.example.com/models/alice/a.json", "tex.png"))
            .toBe("https://cdn.example.com/models/alice/tex.png");
        expect(resolvePuppetSibling("https://cdn.example.com/models/alice/a.json", "../shared/t.png"))
            .toBe("https://cdn.example.com/models/shared/t.png");
        expect(resolvePuppetSibling("//cdn.example.com/models/a.json", "tex.png"))
            .toBe("//cdn.example.com/models/tex.png");
        expect(resolvePuppetSibling("/models/alice/a.json", "tex.png"))
            .toBe("/models/alice/tex.png");
        // A scheme with no authority — the shape a desktop host's custom protocol tends to take.
        expect(resolvePuppetSibling("app:models/alice/a.json", "tex.png"))
            .toBe("app:models/alice/tex.png");
    });

    it("leaves an already-absolute path exactly as the manifest wrote it", () => {
        expect(resolvePuppetSibling(manifest, "/textures/t.png")).toBe("/textures/t.png");
        expect(resolvePuppetSibling(manifest, "https://cdn.example.com/t.png"))
            .toBe("https://cdn.example.com/t.png");
        expect(resolvePuppetSibling(manifest, "//cdn.example.com/t.png"))
            .toBe("//cdn.example.com/t.png");
        expect(resolvePuppetSibling(manifest, "data:image/png;base64,AAAA"))
            .toBe("data:image/png;base64,AAAA");
    });

    it("drops the query and fragment of the src, which belong to it and not to its directory", () => {
        expect(resolvePuppetSibling("models/alice/a.json?v=2", "tex.png"))
            .toBe("models/alice/tex.png");
        expect(resolvePuppetSibling("models/alice/a.json#frag", "tex.png"))
            .toBe("models/alice/tex.png");
    });

    it("reads a native Windows path, and answers with forward slashes", () => {
        expect(resolvePuppetSibling("C:\\models\\alice\\a.json", "textures\\t.png"))
            .toBe("C:/models/alice/textures/t.png");
    });

    it("has no directory to work with when the src is not a location", () => {
        // A data URI is a payload, and a bare name has nothing before its last slash. Both hand the
        // path back rather than inventing a base for it.
        expect(resolvePuppetSibling("data:application/json;base64,AAAA", "tex.png")).toBe("tex.png");
        expect(resolvePuppetSibling("alice.model.json", "tex.png")).toBe("tex.png");
        expect(resolvePuppetSibling("an-opaque-key", "textures/t.png")).toBe("textures/t.png");
    });

    it("resolves an empty path to the src itself", () => {
        expect(resolvePuppetSibling(manifest, "")).toBe(manifest);
    });
});
