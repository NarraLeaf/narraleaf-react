import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WordBody } from "@player/elements/say/Sentence";
import type { WordRenderProps } from "@core/elements/character/word";

/**
 * What a custom renderer is handed, and what happens to the engine's own typesetting when it takes
 * over.
 *
 * The contract that matters is `children`: the renderer receives the word's text *already laid
 * out* — ruby placed, vertical runs segmented — so a renderer that does nothing but wrap
 * `{children}` keeps all of it without knowing any of it exists. Rendering the raw `text` prop
 * instead drops it silently, which is exactly the kind of loss nobody notices until a Japanese
 * vertical build ships.
 *
 * There is no React harness in this repo (see the notes on the test idiom), so these render to
 * static markup on the server, which needs no DOM. That covers the tree `WordBody` builds and the
 * props it passes; the click and typing behaviour around it is left to the real machine.
 */

const style: React.CSSProperties = { color: "#ff0000" };

function baseWord(overrides: Partial<{
    text: string;
    full: string;
    config: Record<string, unknown>;
}> = {}) {
    const text = overrides.text ?? "以太浓度";
    return {
        text,
        full: overrides.full ?? text,
        config: (overrides.config ?? {}) as never,
        tag: 0,
        // The index of the last character revealed so far, which is what the typewriter puts here.
        tag2: text.length - 1,
    };
}

describe("WordBody", () => {
    it("renders the plain text when the word has no renderer", () => {
        const markup = renderToStaticMarkup(
            <WordBody
                word={baseWord()}
                vertical={false}
                tateChuYoko={undefined}
                done={false}
                style={style}
                renderer={null}
            />
        );

        expect(markup).toBe("以太浓度");
    });

    it("wraps the laid-out text in the renderer rather than replacing it", () => {
        const Term = ({ children }: WordRenderProps) => <span className="term">{children}</span>;

        const markup = renderToStaticMarkup(
            <WordBody
                word={baseWord()}
                vertical={false}
                tateChuYoko={undefined}
                done={false}
                style={style}
                renderer={Term}
            />
        );

        expect(markup).toBe("<span class=\"term\">以太浓度</span>");
    });

    it("keeps ruby inside the renderer", () => {
        const Term = ({ children }: WordRenderProps) => <span className="term">{children}</span>;

        const markup = renderToStaticMarkup(
            <WordBody
                word={baseWord({ config: { ruby: "エーテル" } })}
                vertical={false}
                tateChuYoko={undefined}
                done={false}
                style={style}
                renderer={Term}
            />
        );

        expect(markup).toContain("<ruby");
        expect(markup).toContain("エーテル");
        expect(markup).toContain("以太浓度");
    });

    it("keeps vertical tate-chu-yoko segmentation inside the renderer", () => {
        const Term = ({ children }: WordRenderProps) => <span className="term">{children}</span>;
        const plain = renderToStaticMarkup(
            <WordBody
                word={baseWord({ text: "42年", full: "42年" })}
                vertical={true}
                tateChuYoko={true}
                done={false}
                style={style}
                renderer={null}
            />
        );
        const wrapped = renderToStaticMarkup(
            <WordBody
                word={baseWord({ text: "42年", full: "42年" })}
                vertical={true}
                tateChuYoko={true}
                done={false}
                style={style}
                renderer={Term}
            />
        );

        // Whatever the vertical layout produced for the un-rendered word turns up unchanged inside
        // the renderer. Asserting the equality rather than the markup keeps this test about the
        // hand-off and lets the vertical tests own the layout itself.
        expect(plain).not.toBe("42年");
        expect(wrapped).toBe(`<span class="term">${plain}</span>`);
    });

    it("reports a half-typed word as not yet revealed", () => {
        const Probe = ({ text, fullText, revealed }: WordRenderProps) =>
            <span data-revealed={String(revealed)} data-text={text} data-full={fullText} />;

        const markup = renderToStaticMarkup(
            <WordBody
                word={baseWord({ text: "以太", full: "以太浓度" })}
                vertical={false}
                tateChuYoko={undefined}
                done={false}
                style={style}
                renderer={Probe}
            />
        );

        expect(markup).toContain("data-revealed=\"false\"");
        expect(markup).toContain("data-text=\"以太\"");
        expect(markup).toContain("data-full=\"以太浓度\"");
    });

    it("counts a word containing a line break as revealed on its last character", () => {
        const Probe = ({ revealed }: WordRenderProps) => <span data-revealed={String(revealed)} />;
        // A line break is a `<br />` between two fragments and belongs to neither, so the revealed
        // text of the last fragment is shorter than the word will ever be. Reading the character
        // index instead is what keeps such a word from staying "not yet revealed" forever.
        const lastFragment = {
            text: "b",
            full: "a\nb",
            config: {} as never,
            tag: 0,
            tag2: 2,
        };

        const markup = renderToStaticMarkup(
            <WordBody
                word={lastFragment}
                vertical={false}
                tateChuYoko={undefined}
                done={true}
                style={style}
                renderer={Probe}
            />
        );

        expect(markup).toContain("data-revealed=\"true\"");
    });

    it("hands the renderer the resolved style, the config and the payload", () => {
        const data = { entry: "aether" };
        const Probe = (props: WordRenderProps<{ entry: string }>) => {
            // Round-tripped through the markup so the assertions below read what the renderer got.
            expect(props.style).toBe(style);
            expect(props.data).toBe(data);
            expect(props.config.ruby).toBe("エーテル");
            expect(props.done).toBe(true);
            expect(props.revealed).toBe(true);
            return <span />;
        };

        renderToStaticMarkup(
            <WordBody
                word={baseWord({ config: { ruby: "エーテル", data } })}
                vertical={false}
                tateChuYoko={undefined}
                done={true}
                style={style}
                renderer={Probe}
            />
        );

        expect.assertions(5);
    });
});

describe("WordBody reveal", () => {
    it("draws the word as one node when nothing is fading", () => {
        // The default, and what every line that is not being typed out gets. Byte-identical to the
        // markup the word had before the reveal effect existed, which is the point.
        const plain = renderToStaticMarkup(
            <WordBody word={baseWord()} vertical={false} tateChuYoko={undefined} done={false} style={style} renderer={null} />
        );
        const explicit = renderToStaticMarkup(
            <WordBody word={baseWord()} vertical={false} tateChuYoko={undefined} done={false} style={style} renderer={null} revealTail={0} />
        );

        expect(plain).toBe("以太浓度");
        expect(explicit).toBe(plain);
    });

    it("gives the fading characters their own elements and leaves the rest settled", () => {
        const markup = renderToStaticMarkup(
            <WordBody word={baseWord()} vertical={false} tateChuYoko={undefined} done={false} style={style} renderer={null} revealTail={2} />
        );

        expect(markup).toBe("以太<span class=\"__narraleaf_text_reveal\">浓</span>"
            + "<span class=\"__narraleaf_text_reveal\">度</span>");
    });

    it("keeps ruby around a word that is still fading", () => {
        const markup = renderToStaticMarkup(
            <WordBody
                word={baseWord({ config: { ruby: "エーテル" } })}
                vertical={false}
                tateChuYoko={undefined}
                done={false}
                style={style}
                renderer={null}
                revealTail={2}
            />
        );

        expect(markup).toContain("<ruby");
        expect(markup).toContain("エーテル");
        expect(markup).toContain("__narraleaf_text_reveal");
    });

    it("hands a custom renderer the split text rather than making it do the splitting", () => {
        // The whole reason the split lives where it does: a word with its own renderer fades in
        // like any other and the renderer never learns that it does.
        const Term = ({ children }: WordRenderProps) => <span className="term">{children}</span>;
        const markup = renderToStaticMarkup(
            <WordBody word={baseWord()} vertical={false} tateChuYoko={undefined} done={false} style={style} renderer={Term} revealTail={1} />
        );

        expect(markup).toBe("<span class=\"term\">以太浓"
            + "<span class=\"__narraleaf_text_reveal\">度</span></span>");
    });
});
