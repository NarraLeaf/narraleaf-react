import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import {
    PLAYER_CLASS,
    STYLE_ATTRIBUTE,
    STYLE_LAYER,
    compilePlayerCss,
    injectionModuleSource,
    isolateInjectedCss,
} from "../injectedCss.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCOPE = `:where(.${PLAYER_CLASS},.${PLAYER_CLASS} *)`;

/** Every style rule outside @keyframes, with the at-rules it sits in. */
function styleRules(css) {
    const rules = [];
    postcss.parse(css).walkRules((rule) => {
        const chain = [];
        let inKeyframes = false;
        for (let parent = rule.parent; parent && parent.type !== "root"; parent = parent.parent) {
            if (parent.type === "atrule") {
                chain.unshift(`@${parent.name} ${parent.params}`);
                inKeyframes ||= /keyframes$/i.test(parent.name);
            }
        }
        if (!inKeyframes) {
            rules.push({ selectors: rule.selectors, chain });
        }
    });
    return rules;
}

describe("isolateInjectedCss", () => {
    it("scopes a utility to the player without changing its specificity", () => {
        const out = isolateInjectedCss(".border{border-width:1px}");
        expect(styleRules(out)[0].selectors).toEqual([`.border${SCOPE}`]);
    });

    it("puts the scope ahead of a pseudo-element", () => {
        const out = isolateInjectedCss(".x:before,.y::placeholder,::backdrop{color:red}");
        expect(styleRules(out)[0].selectors).toEqual([
            `.x${SCOPE}:before`,
            `.y${SCOPE}::placeholder`,
            `${SCOPE}::backdrop`,
        ]);
    });

    it("scopes the subject of a compound selector, not an ancestor", () => {
        const out = isolateInjectedCss(".pointer-events-auto-rest *{pointer-events:auto}");
        expect(styleRules(out)[0].selectors).toEqual([`.pointer-events-auto-rest *${SCOPE}`]);
    });

    it("leaves a rule that already names the player as it is", () => {
        const out = isolateInjectedCss(`.${PLAYER_CLASS} img{pointer-events:none}`);
        expect(styleRules(out)[0].selectors).toEqual([`.${PLAYER_CLASS} img`]);
    });

    it("layers every rule, keyframes included, and leaves @property outside", () => {
        const out = isolateInjectedCss([
            "/*! banner */",
            "@layer properties{@supports (color:red){*{--a:1}}}",
            ".a{color:red}",
            "@keyframes k{0%{opacity:0}to{opacity:1}}",
            "@media (prefers-reduced-motion:reduce){.a{animation:none}}",
            "@property --a{syntax:\"*\";inherits:false}",
        ].join(""));
        const root = postcss.parse(out);
        expect(root.nodes.map((node) => node.type === "atrule" ? `@${node.name} ${node.params}` : node.type))
            .toEqual(["comment", `@layer ${STYLE_LAYER}`, "@property --a"]);
        const layer = root.nodes[1];
        expect(layer.nodes.map((node) => node.type === "rule" ? node.selector : `@${node.name}`)).toEqual([
            "@layer",
            `.a${SCOPE}`,
            "@keyframes",
            "@media",
        ]);
        // Keyframe selectors are offsets, not elements.
        const offsets = [];
        root.walkAtRules("keyframes", (keyframes) => keyframes.walkRules((rule) => offsets.push(rule.selector)));
        expect(offsets).toEqual(["0%", "to"]);
    });

    // The real sheet, built the way esbuild.config.js builds it. Whatever a later Tailwind emits,
    // none of it may reach an element outside the player or sit outside the layer.
    it("leaves nothing in the shipped sheet that can match outside the player or outrank the page", async () => {
        const file = path.resolve(here, "../../src/styles/index.css");
        const out = await compilePlayerCss(await fs.readFile(file, "utf8"), file);
        const rules = styleRules(out);
        expect(rules.length).toBeGreaterThan(10);
        for (const rule of rules) {
            expect(rule.chain[0]).toBe(`@layer ${STYLE_LAYER}`);
            for (const selector of rule.selectors) {
                expect(selector).toContain(`.${PLAYER_CLASS}`);
            }
        }
        const root = postcss.parse(out);
        for (const node of root.nodes) {
            expect(node.type === "comment" || (node.type === "atrule" && (node.name === "property" || node.params === STYLE_LAYER))).toBe(true);
        }
    });

    // A class named anywhere outside src - the changelog, a build script, this test - must not
    // turn into a rule. It used to: the scan covered the whole checkout. This file names
    // `w-[123457px]` and is outside src.
    it("takes class names from src only", async () => {
        const file = path.resolve(here, "../../src/styles/index.css");
        const out = await compilePlayerCss(await fs.readFile(file, "utf8"), file);
        expect(out).not.toContain("123457px");
    });
});

describe("injectionModuleSource", () => {
    function run(source) {
        const inserted = [];
        const first = { tag: "link" };
        const document = {
            createElement: (tag) => ({ tag, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }),
            head: {
                firstChild: first,
                insertBefore: (node, before) => inserted.push({ node, before }),
                appendChild: (node) => inserted.push({ node, before: null }),
            },
        };
        new Function("document", source)(document);
        return { inserted, first };
    }

    it("puts the sheet first in <head>, marked, with the css as given", () => {
        const { inserted, first } = run(injectionModuleSource(".a{color:red}"));
        expect(inserted).toHaveLength(1);
        expect(inserted[0].before).toBe(first);
        expect(inserted[0].node.tag).toBe("style");
        expect(inserted[0].node.attributes).toEqual({ [STYLE_ATTRIBUTE]: "" });
        expect(inserted[0].node.textContent).toBe(".a{color:red}");
    });

    it("does nothing where there is no document", () => {
        expect(() => new Function(injectionModuleSource(".a{}"))()).not.toThrow();
    });
});
