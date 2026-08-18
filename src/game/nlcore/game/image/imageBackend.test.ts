import { describe, expect, it, vi } from "vitest";
import { ImageBackendRegistry } from "@core/game/image/imageBackend";

const backend = (name: string) => ({ name, mount: () => ({}) });

describe("ImageBackendRegistry", () => {
    it("resolves a registered backend and refuses a nameless one", () => {
        const registry = new ImageBackendRegistry();
        registry.register(backend("framed"));
        expect(registry.get("framed")?.name).toBe("framed");
        expect(registry.has("framed")).toBe(true);
        expect(registry.get("absent")).toBeNull();
        expect(() => registry.register({ name: "", mount: () => ({}) })).toThrow();
        expect(() => registry.register({ name: "x" } as never)).toThrow();
    });

    it("replaces a backend registered twice under one name", () => {
        const registry = new ImageBackendRegistry();
        const first = backend("framed");
        const second = backend("framed");
        registry.register(first).register(second);
        expect(registry.get("framed")).toBe(second);
        expect(registry.list()).toEqual(["framed"]);
    });

    it("reports a missing backend once, and again after it is unregistered", () => {
        const registry = new ImageBackendRegistry();
        const warn = vi.fn();
        expect(registry.reportMissing("framed", warn)).toBe(true);
        expect(registry.reportMissing("framed", warn)).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        // Registering clears the report, so a later removal is reported again rather than staying
        // silent for the rest of the session.
        registry.register(backend("framed"));
        registry.unregister("framed");
        expect(registry.reportMissing("framed", warn)).toBe(true);
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
