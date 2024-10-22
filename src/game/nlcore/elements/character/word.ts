import {Color, color, Font} from "@core/types";
import {deepMerge} from "@lib/util/data";
import {DynamicWord} from "@core/elements/character/sentence";
import {ScriptCtx} from "@core/elements/script";

export type WordConfig = {
    className?: string;
    ruby?: string;
} & Color & Font;

export class Word<T extends string | DynamicWord = string | DynamicWord> {
    static defaultConfig: Partial<WordConfig> = {};
    static defaultColor: color = "#000";

    static isWord(obj: any): obj is Word {
        return obj instanceof Word;
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
    evaluate(ctx: ScriptCtx): Word<string>[] {
        if (typeof this.text === "function") {
            const texts: string | Word | (string | Word)[] = this.text(ctx);
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
            return [new Word(texts, this.config)];
        }
        return [this as Word<string>];
    }

    /**@internal */
    inherit(config: Partial<WordConfig>): this {
        this.config.color = this.config.color || config.color;
        this.config.italic = this.config.italic || config.italic;
        this.config.bold = this.config.bold || config.bold;
        return this;
    }
}
