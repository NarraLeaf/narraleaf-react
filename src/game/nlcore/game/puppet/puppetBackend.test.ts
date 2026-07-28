import { describe, expect, it, vi } from "vitest";
import { PuppetBackendRegistry } from "@core/game/puppet/puppetBackend";
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
