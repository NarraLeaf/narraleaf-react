import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getWordRenderer,
    registerWordRenderer,
    resolveWordRenderer,
    unregisterWordRenderer,
} from "@player/elements/say/wordRenderer";

/**
 * The registry exists so a word that arrives as data can still be rendered.
 *
 * A word built in code holds its component directly. A word compiled out of a story file, or
 * contributed by a plugin, can only hold a name — and the name may be one nothing answers to,
 * because the plugin that would have registered it is not installed. That case has to read as
 * ordinary text: a missing renderer is a line the player can still read, while a throw is a scene
 * that will not play.
 */

const First = () => null;
const Second = () => null;

afterEach(() => {
    unregisterWordRenderer("glossary");
    vi.restoreAllMocks();
});

describe("word renderer registry", () => {
    it("resolves a component carried directly", () => {
        expect(resolveWordRenderer(First)).toBe(First);
    });

    it("resolves a registered id", () => {
        registerWordRenderer("glossary", First);

        expect(getWordRenderer("glossary")).toBe(First);
        expect(resolveWordRenderer("glossary")).toBe(First);
    });

    it("renders as plain text when nothing answers to the id, and says so once", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });

        expect(resolveWordRenderer("not-installed")).toBeNull();
        expect(resolveWordRenderer("not-installed")).toBeNull();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("not-installed");
    });

    it("has nothing to resolve when a word carries no renderer", () => {
        expect(resolveWordRenderer(undefined)).toBeNull();
    });

    it("lets a later registration replace an earlier one", () => {
        registerWordRenderer("glossary", First);
        registerWordRenderer("glossary", Second);

        expect(resolveWordRenderer("glossary")).toBe(Second);
    });

    it("hands back a release that only drops its own registration", () => {
        const release = registerWordRenderer("glossary", First);
        registerWordRenderer("glossary", Second);
        release();

        // The release belongs to `First`, which is no longer the one registered - calling it must
        // not take `Second` down with it.
        expect(resolveWordRenderer("glossary")).toBe(Second);
    });

    it("forgets a registration on release", () => {
        vi.spyOn(console, "warn").mockImplementation(() => { });
        const release = registerWordRenderer("glossary", First);
        release();

        expect(resolveWordRenderer("glossary")).toBeNull();
    });
});
