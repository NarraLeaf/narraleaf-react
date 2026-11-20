import type { WordRenderer, WordRenderProps } from "@core/elements/character/word";
import type React from "react";

/**
 * Components a word can name by id instead of carrying directly.
 *
 * A word built in code can hold its renderer as a function. A word that arrives as data — compiled
 * from a story file, contributed by a plugin — cannot, so it names one instead and the name is
 * resolved here at render time.
 */
const registry: Map<string, React.ComponentType<WordRenderProps<any>>> = new Map();
const warnedMissing: Set<string> = new Set();
/** Components registered with `interactive: false`; see {@link WordRendererOptions.interactive}. */
const passive: WeakSet<React.ComponentType<WordRenderProps<any>>> = new WeakSet();

/**
 * Options for {@link registerWordRenderer}.
 */
export type WordRendererOptions = {
    /**
     * Whether a word drawn by this component takes the player's clicks once it is revealed, instead
     * of letting them advance the line.
     *
     * A renderer that the player interacts with - a glossary term that opens on click - wants the
     * click for itself, which is the default. A renderer that only changes how the text looks -
     * shaking or waving characters - does not: with the default, the part of the dialogue box its
     * word covers would stop advancing the line. Set `false` for those.
     * @default true
     */
    interactive?: boolean;
};

/**
 * Register a component that words may name by id.
 *
 * Registering the same id again replaces the component; lines already on screen pick the new one up
 * on their next render.
 *
 * @param id - The id words refer to, e.g. `"glossary"`.
 * @param component - The component to render those words with.
 * @param options - Whether the words take the player's clicks; see {@link WordRendererOptions}.
 * @returns A function that unregisters it again.
 * @example
 * ```tsx
 * registerWordRenderer("glossary", GlossaryTerm);
 * // a word compiled from story data can now ask for it by name
 * new Word("以太浓度", {render: "glossary", data: {entry: "aether"}});
 * ```
 */
export function registerWordRenderer<T = unknown>(
    id: string,
    component: React.ComponentType<WordRenderProps<T>>,
    options?: WordRendererOptions
): () => void {
    registry.set(id, component as React.ComponentType<WordRenderProps<any>>);
    if (options?.interactive === false) {
        passive.add(component as React.ComponentType<WordRenderProps<any>>);
    } else {
        passive.delete(component as React.ComponentType<WordRenderProps<any>>);
    }
    warnedMissing.delete(id);
    return () => {
        if (registry.get(id) === component) {
            registry.delete(id);
        }
    };
}

/**
 * Drop a registration made by {@link registerWordRenderer}.
 * @param id - The id to forget.
 */
export function unregisterWordRenderer(id: string): void {
    registry.delete(id);
}

/**
 * The component registered under an id, or `null`.
 * @param id - The id to look up.
 */
export function getWordRenderer(id: string): React.ComponentType<WordRenderProps<any>> | null {
    return registry.get(id) ?? null;
}

/**
 * Turn whatever a word carries in `render` into a component, or `null` for plain text.
 *
 * An id nothing is registered under resolves to `null` rather than throwing: a line whose plugin is
 * not installed should read as ordinary text, not take the scene down with it. The miss is reported
 * once per id.
 * @internal
 */
export function resolveWordRenderer(
    render: WordRenderer | undefined
): React.ComponentType<WordRenderProps<any>> | null {
    if (!render) {
        return null;
    }
    if (typeof render !== "string") {
        return render as React.ComponentType<WordRenderProps<any>>;
    }

    const resolved = registry.get(render);
    if (!resolved) {
        if (!warnedMissing.has(render)) {
            warnedMissing.add(render);
            console.warn(
                `NarraLeaf-React: no word renderer is registered as "${render}"; `
                + "the word is rendered as plain text. Call registerWordRenderer before the line plays."
            );
        }
        return null;
    }
    return resolved;
}

/**
 * Whether a word drawn by `component` takes the player's clicks once revealed. A component carried
 * directly by a word, rather than registered, always does.
 * @internal
 */
export function isInteractiveWordRenderer(component: React.ComponentType<WordRenderProps<any>>): boolean {
    return !passive.has(component);
}
