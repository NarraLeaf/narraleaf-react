import {Color, Font} from "@core/types";
import {deepMerge} from "@lib/util/data";
import {DynamicWord} from "@core/elements/character/sentence";
import {ScriptCtx} from "@core/elements/script";
import {Pause, Pausing} from "@core/elements/character/pause";
import {TextEvent} from "@core/elements/character/textEvent";
import type React from "react";

/**
 * What a custom word renderer receives.
 *
 * A custom-rendered word is still an ordinary text word — it goes into the backlog, the read-text
 * record and the voice pipeline as its plain text, and it is typed out character by character like
 * any other. The renderer only decides what the revealed characters look like and what happens when
 * they are interacted with.
 */
export type WordRenderProps<T = unknown> = {
    /**
     * The word's text as the engine has already laid it out — ruby, vertical writing mode and
     * tate-chu-yoko are applied here. Render this rather than {@link WordRenderProps.text}, or those
     * settings are silently dropped.
     */
    children: React.ReactNode;
    /** The characters revealed so far. Equal to `fullText` once the typewriter has passed the word. */
    text: string;
    /** The whole word, revealed or not. */
    fullText: string;
    /** Whether every character of this word has been revealed. */
    revealed: boolean;
    /** Whether the whole line has finished revealing. */
    done: boolean;
    /**
     * The resolved style chain for this word (engine defaults, then the dialog's text props, then
     * the sentence, then the word). Already applied to the element wrapping the renderer; passed in
     * so the renderer can measure against it or carry it into a portal.
     */
    style: Readonly<React.CSSProperties>;
    /** The word's own config, as given to {@link Word}. */
    config: Readonly<Partial<WordConfig>>;
    /** The payload passed as `data` when the word was created. */
    data: T;
};

/**
 * A component to render a word with, or the id of one registered with `registerWordRenderer`.
 *
 * Pass a component in code; pass an id when the word comes from data (a story file, a plugin) and
 * cannot carry a function. An id that resolves to nothing renders as plain text.
 */
export type WordRenderer<T = any> = string | React.ComponentType<WordRenderProps<T>>;

/**
 * Emphasis marks: a small glyph drawn beside every character of a word, the typographic way East
 * Asian text stresses a phrase where a Latin one would go italic (傍点 / 圏点 in Japanese, 着重号 in
 * Chinese). The marks follow the characters as they are typed out, so a word that is half revealed
 * carries half its marks.
 */
export type WordEmphasis = {
    /**
     * The glyph drawn beside each character.
     * @default "dot"
     */
    mark?: "dot" | "circle" | "sesame" | "triangle";
    /**
     * Whether that glyph is solid or hollow.
     * @default "filled"
     */
    fill?: "filled" | "open";
    /**
     * Which side of the text the marks sit on. In horizontal writing `over` is above the line and
     * `under` is below it; in vertical writing both sit to the right of the column, where the
     * convention places them.
     * @default "over"
     */
    position?: "over" | "under";
};

export type WordConfig = {
    className: string;
    ruby: string;
    color: Color;
    cps?: number;  // characters per second
    /**
     * Emphasis marks drawn beside this word's characters. See {@link Word.emphasis}.
     */
    emphasis?: WordEmphasis;
    /**
     * This word's size as a share of the line's — `1.25` for a quarter larger, `0.8` for a fifth
     * smaller. Relative rather than absolute, so the word keeps its weight against the rest of the
     * line whatever size the line is set at, including while text scaling brings the line down to
     * fit its box.
     *
     * Ignored when {@link WordConfig.fontSize} is set, which pins the word to an absolute size.
     */
    fontScale?: number;
    /**
     * Renders this word's revealed characters. See {@link Word.custom}.
     */
    render?: WordRenderer;
    /**
     * Arbitrary payload handed to {@link WordConfig.render} as `data`. Never merged or cloned — the
     * renderer receives the very value given here.
     */
    data?: unknown;
} & Font;

/**
 * `render` and `data` are kept out of {@link deepMerge}: a component produced by `React.memo` or
 * `React.forwardRef` is a plain object, so merging would rebuild it into a different object every
 * time a word is constructed or copied, and an arbitrary `data` payload would be deep-cloned and
 * lose its identity. Both are carried by reference instead.
 * @internal
 */
function mergeWordConfig(
    base: Partial<WordConfig>,
    incoming: Partial<WordConfig>
): Partial<WordConfig> {
    const {render: _render, data: _data, ...mergeable} = incoming;
    const result = deepMerge<Partial<WordConfig>>(base, mergeable);

    if ("render" in incoming) {
        result.render = incoming.render;
    } else if ("render" in base) {
        result.render = base.render;
    }
    if ("data" in incoming) {
        result.data = incoming.data;
    } else if ("data" in base) {
        result.data = base.data;
    }
    return result;
}

export class Word<T extends string | DynamicWord | Pausing | TextEvent = string | DynamicWord | Pausing | TextEvent> {
    /**@internal */
    static defaultConfig: Partial<WordConfig> = {};
    /**@internal */
    static defaultColor: Color = "#000";

    static isWord(obj: any): obj is Word {
        return obj instanceof Word;
    }

    /**
     * Create a word with an explicit color or re-color an existing word.
     * @example
     * ```ts
     * Word.color("Hello", "#f00");
     * ```
     * @param text - The existing word or raw text.
     * @param color - The CSS color to apply.
     */
    public static color(text: string | Word, color: Color): Word {
        if (Word.isWord(text)) {
            return text.copy().assign({color});
        }
        return new Word(text, {color});
    }

    /**
     * Return a bold version of the provided word.
     * @param text - The text or word to bold.
     */
    public static bold(text: string | Word): Word {
        if (Word.isWord(text)) {
            return text.copy().assign({bold: true});
        }
        return new Word(text, {bold: true});
    }

    /**
     * Return an italic version of the provided word.
     * @param text - The text or word to italicize.
     */
    public static italic(text: string | Word): Word {
        if (Word.isWord(text)) {
            return text.copy().assign({italic: true});
        }
        return new Word(text, {italic: true});
    }

    /**
     * Return a word with emphasis marks beside its characters — the East Asian counterpart of
     * italicising a phrase.
     *
     * @param text - The text or word to emphasise.
     * @param emphasis - Which glyph to draw and which side of the text to draw it on. Defaults to a
     * filled dot above the line, the Japanese convention; Chinese text sets `position: "under"`.
     * @example
     * ```ts
     * character.say(["それは", Word.emphasis("わたし"), "が決めることです。"]);
     * character.say(["这是", Word.emphasis("我", {position: "under"}), "的决定。"]);
     * ```
     */
    public static emphasis(text: string | Word, emphasis: WordEmphasis = {}): Word {
        if (Word.isWord(text)) {
            return text.copy().assign({emphasis});
        }
        return new Word(text, {emphasis});
    }

    /**
     * Render a word with a component of your own — an inline glossary term that opens a definition
     * popup, a name that links into an in-game encyclopedia, anything the dialogue box cannot say
     * with color and weight alone.
     *
     * The word stays a text word in every other respect: it is typed out character by character, it
     * reaches the backlog and the read-text record as its plain text, and it is never serialized —
     * the renderer is re-attached when the `say` action is evaluated again, so a save carries no
     * trace of it.
     *
     * The renderer sits *inside* the element the engine styles, so the style chain (engine defaults
     * → the dialog's text props → the sentence → the word) already applies to it; anything the
     * renderer sets wins, being last. `render` propagates to plain strings a dynamic word returns,
     * the same way `className` does.
     *
     * While a custom word is still being typed, a click on it advances the line as a click anywhere
     * else would. Once revealed, the word takes its own clicks — the line does not advance behind
     * the renderer's back.
     *
     * @param text - The word's text, or an existing word to re-render.
     * @param render - A component, or the id of one registered with `registerWordRenderer`.
     * @param config - Optional styling, plus the `data` payload handed to the renderer.
     * @example
     * ```tsx
     * function GlossaryTerm({children, revealed, data}: WordRenderProps<{entry: string}>) {
     *     const [open, setOpen] = useState(false);
     *     return (
     *         <span className="underline decoration-dotted"
     *               onClick={() => revealed && setOpen(v => !v)}>
     *             {children}
     *             {open && <span className="absolute">{lookUp(data.entry)}</span>}
     *         </span>
     *     );
     * }
     *
     * character.say([
     *     "今天的",
     *     Word.custom("以太浓度", GlossaryTerm, {data: {entry: "aether"}}),
     *     "高得反常。",
     * ]);
     * ```
     */
    public static custom<T = unknown>(
        text: string | Word,
        render: WordRenderer<T>,
        config: Partial<Omit<WordConfig, "render" | "data">> & { data?: T } = {}
    ): Word {
        const assigned: Partial<WordConfig> = {...config, render: render as WordRenderer};
        if (Word.isWord(text)) {
            return text.copy().assign(assigned);
        }
        return new Word(text, assigned);
    }

    /**@internal */
    static getText(words: Word<Pausing | string | TextEvent>[]): string {
        return words
            .filter(word => !word.isPause() && !word.isTextEvent())
            .map(word => word.toString())
            .join("");
    }

    /**@internal */
    readonly text: T;
    /**@internal */
    config: Partial<WordConfig>;

    /**
     * Wrap raw data (string, dynamic function, or pause) into a `Word` for sentences.
     * @param text - The payload shown in dialogue, which may be static, dynamic, or a pause.
     * @param config - Optional styling settings such as color, ruby, and cps.
     */
    constructor(text: T, config: Partial<WordConfig> = {}) {
        this.text = text;
        this.config = mergeWordConfig(Word.defaultConfig, config);
    }

    /**@internal */
    evaluate(ctx: ScriptCtx): Word<string | Pausing | TextEvent>[] {
        if (Pause.isPause(this.text)) {
            return [this as Word<Pausing>];
        } else if (TextEvent.isTextEvent(this.text)) {
            return [this as Word<TextEvent>];
        } else if (typeof this.text === "function") {
            const texts: string | Word | Pausing | (string | Word | Pausing)[] = this.text(ctx);
            if (Array.isArray(texts)) {
                return texts.map(text => {
                    if (Word.isWord(text)) {
                        return text.inherit(this.config).evaluate(ctx);
                    }
                    return new Word(text, this.config);
                }).flat();
            }
            if (Word.isWord(texts)) {
                return texts.inherit(this.config).evaluate(ctx);
            }
            return [new Word<string | Pausing>(texts, this.config)];
        }
        return [this as Word<string>];
    }

    /**
     * Appearance a nested word inherits from the word that produced it. `render` is deliberately
     * absent: a word that already carries its own identity must not be re-clothed by the one that
     * evaluated it.
     * @internal
     */
    inherit(config: Partial<WordConfig>): this {
        this.config.color = this.config.color || config.color;
        this.config.italic = this.config.italic ?? config.italic;
        this.config.bold = this.config.bold ?? config.bold;
        this.config.cps = this.config.cps ?? config.cps;
        this.config.emphasis = this.config.emphasis ?? config.emphasis;
        this.config.fontScale = this.config.fontScale ?? config.fontScale;
        return this;
    }

    /**@internal */
    assign(config: Partial<WordConfig>): this {
        this.config = mergeWordConfig(this.config, config);
        return this;
    }

    /**@internal */
    copy(): Word<T> {
        return new Word(this.text, this.config);
    }

    /**@internal */
    isPause(): this is Word<Pausing> {
        return Pause.isPause(this.text);
    }

    /**@internal */
    isTextEvent(): this is Word<TextEvent> {
        return TextEvent.isTextEvent(this.text);
    }

    /**
     * Render the text value if it is a plain string.
     * @returns The raw string, or an empty string for dynamic content.
     */
    toString(): string {
        if (typeof this.text === "string") {
            return this.text;
        }
        return "";
    }
}
