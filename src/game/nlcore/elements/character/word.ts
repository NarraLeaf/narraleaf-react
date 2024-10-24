import {Color, color, Font} from "@core/types";
import {deepMerge} from "@lib/util/data";
import {DynamicWord} from "@core/elements/character/sentence";
import {ScriptCtx} from "@core/elements/script";
import {Pause, Pausing} from "@core/elements/character/pause";

export type WordConfig = {
    className?: string;
    ruby?: string;
} & Color & Font;

export class Word<T extends string | DynamicWord | Pausing = string | DynamicWord | Pausing> {
    /**@internal */
    static defaultConfig: Partial<WordConfig> = {};
    /**@internal */
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
        this.config.italic = this.config.italic || config.italic;
        this.config.bold = this.config.bold || config.bold;
        return this;
    }
}
