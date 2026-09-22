/*
 * The player's stylesheet is compiled at build time and injected at run time into whatever page
 * imports the library - a page that has styles of its own. This module is what keeps that sheet
 * from restyling the page.
 *
 * Injected as Tailwind emits it, the sheet would restyle the host twice over:
 *
 * - Tailwind finds class names by reading the source as text, so the sheet carries a rule for
 *   every word in it that happens to be a utility: `static` from the keyword, `flex` from
 *   `display: "flex"`, `transition` and `border` from comments. Most of those names are also on the
 *   host's own elements.
 * - Unlayered and last in <head>, those rules beat the host's own on an equal specificity: `border`
 *   resets the width an earlier `border-l-2` set, `hidden` beats `lg:inline`, `transition` sets
 *   every duration to 0s.
 *
 * So every rule is rewritten to match only the player root and what is inside it, the whole sheet
 * goes into one cascade layer, and the style element is inserted first in <head>. A layered rule
 * loses to every unlayered rule whatever the specificity or the order, and a layer declared first
 * loses to every layer declared after it, so inside the player too anything the host says about an
 * element wins, and the sheet only supplies what the host leaves unsaid.
 *
 * Tailwind is pointed at `src` rather than at the whole checkout: from the checkout it also reads
 * the changelog and the build scripts, and describing a class in a release note would put a rule
 * for it into the next release's sheet.
 */
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

/** The class the player puts on its root element (see `Player.tsx`). */
export const PLAYER_CLASS = "__narraleaf_content-player";

/** The cascade layer the injected sheet lives in. */
export const STYLE_LAYER = "narraleaf-react";

/** The attribute the injected style element carries, so a host or a test can find it. */
export const STYLE_ATTRIBUTE = "data-narraleaf-react";

// Adds no specificity: a scoped rule weighs exactly what it weighed before.
const SCOPE = `:where(.${PLAYER_CLASS},.${PLAYER_CLASS} *)`;

const PSEUDO_ELEMENTS_WITH_ONE_COLON = new Set([":before", ":after", ":first-line", ":first-letter"]);

function isPseudoElement(node) {
    return node.type === "pseudo" && (node.value.startsWith("::") || PSEUDO_ELEMENTS_WITH_ONE_COLON.has(node.value.toLowerCase()));
}

function mentionsPlayer(selector) {
    let found = false;
    selector.walkClasses((node) => {
        if (node.value === PLAYER_CLASS) {
            found = true;
        }
    });
    return found;
}

/**
 * Restrict one selector list to the player's subtree. A selector that already names the player is
 * left alone; any other gets the scope on its subject, ahead of a pseudo-element if it has one.
 */
function scopeSelectors(selectorText) {
    return selectorParser((selectors) => {
        selectors.each((selector) => {
            if (mentionsPlayer(selector)) {
                return;
            }
            const nodes = selector.nodes;
            let at = nodes.length;
            for (let i = nodes.length - 1; i >= 0; i--) {
                if (nodes[i].type === "combinator") {
                    break;
                }
                if (isPseudoElement(nodes[i])) {
                    at = i;
                }
            }
            const scope = selectorParser().astSync(SCOPE).first.first;
            if (at === nodes.length) {
                selector.append(scope);
            } else {
                selector.insertBefore(nodes[at], scope);
            }
        });
    }).processSync(selectorText, { lossless: false });
}

function insideKeyframes(rule) {
    for (let parent = rule.parent; parent && parent.type !== "root"; parent = parent.parent) {
        if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) {
            return true;
        }
    }
    return false;
}

/**
 * Scope every rule of a compiled sheet to the player and put the sheet in the library's cascade
 * layer. `@property` registrations stay outside the layer: they are global whatever layer they
 * are written in, and a host that registers the same property after this sheet keeps its own.
 */
export function isolateInjectedCss(css) {
    const root = postcss.parse(css);
    root.walkRules((rule) => {
        if (!insideKeyframes(rule)) {
            rule.selector = scopeSelectors(rule.selector);
        }
    });

    const layer = postcss.atRule({ name: "layer", params: STYLE_LAYER });
    const kept = [];
    for (const node of [...root.nodes]) {
        node.remove();
        if (node.type === "comment" || (node.type === "atrule" && node.name === "property")) {
            kept.push(node);
        } else {
            layer.append(node);
        }
    }
    root.append(...kept.filter((node) => node.type === "comment"), layer, ...kept.filter((node) => node.type !== "comment"));
    return root.toString();
}

/** Compile the player's stylesheet into what the library injects. */
export async function compilePlayerCss(css, from) {
    const result = await postcss([tailwindcss({ base: SOURCE_ROOT }), autoprefixer]).process(css, { from });
    return isolateInjectedCss(result.css);
}

/**
 * The module the bundler substitutes for the stylesheet import: it puts the sheet into the page
 * the library is loaded in, as the first element of <head> - which is what makes its layer the
 * first one declared on the page, and so the weakest.
 */
export function injectionModuleSource(css) {
    return `
        if (typeof document !== "undefined") {
            const style = document.createElement("style");
            style.setAttribute(${JSON.stringify(STYLE_ATTRIBUTE)}, "");
            style.textContent = ${JSON.stringify(css)};
            document.head.insertBefore(style, document.head.firstChild);
        }
    `;
}
