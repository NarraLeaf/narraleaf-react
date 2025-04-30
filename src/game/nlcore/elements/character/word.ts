import {Color, Font} from "@core/types";
import {deepMerge} from "@lib/util/data";
import {DynamicWord} from "@core/elements/character/sentence";
import {ScriptCtx} from "@core/elements/script";
import {Pause, Pausing} from "@core/elements/character/pause";

export type WordConfig = {
    className: string;
    ruby: string;
    color: Color;
    pause: boolean;
    cps?: number;  // characters per second
} & Font;

export class Word<T extends string | DynamicWord | Pausing = string | DynamicWord | Pausing> {
    /**@internal */
    static defaultConfig: Partial<WordConfig> = {};
    /**@internal */
    static defaultColor: Color = "#000";

    static isWord(obj: any): obj is Word {
        return obj instanceof Word;
    }

    public static color(text: string | Word, color: Color): Word {
        if (Word.isWord(text)) {
            return text.copy().assign({color});
        }
        return new Word(text, {color});
    }

    public static bold(text: string | Word): Word {
        if (Word.isWord(text)) {
            return text.copy().assign({bold: true});
        }
        return new Word(text, {bold: true});
    }

    public static italic(text: string | Word): Word {
        if (Word.isWord(text)) {
            return text.copy().assign({italic: true});
        }
        return new Word(text, {italic: true});
    }

    /**@internal */
    static getText(words: Word<Pausing | string>[]): string {
        return words
            .filter(word => !word.isPause())
            .map(word => word.toString())
            .join("");
    }

    /**@internal */
    readonly text: T;
    /**@internal */
    config: Partial<WordConfig>;

    constructor(text: T, config: Partial<WordConfig> = {}) {
        this.text = text;
        this.config = deepMerge<Partial<WordConfig>>(Word.defaultConfig, config);
    }

    /**@internal */
    evaluate(ctx: ScriptCtx): Word<string | Pausing>[] {
        if (Pause.isPause(this.text)) {
            return [this as Word<Pausing>];
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

    /**@internal */
    inherit(config: Partial<WordConfig>): this {
        this.config.color = this.config.color || config.color;
        this.config.italic = this.config.italic ?? config.italic;
        this.config.bold = this.config.bold ?? config.bold;
        this.config.cps = this.config.cps ?? config.cps;
        return this;
    }

    /**@internal */
    assign(config: Partial<WordConfig>): this {
        this.config = deepMerge<Partial<WordConfig>>(this.config, config);
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

    toString(): string {
        if (typeof this.text === "string") {
            return this.text;
        }
        return "";
    }
}
