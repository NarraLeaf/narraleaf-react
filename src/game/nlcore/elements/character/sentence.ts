import {deepEqual, deepMerge, safeClone} from "@lib/util/data";
import {Sound} from "@core/elements/sound";
import type {Character} from "@core/elements/character";
import {Word, WordConfig} from "@core/elements/character/word";
import {Color, Font} from "@core/types";
import type {ScriptCtx} from "@core/elements/script";

export type SentenceConfig = {
    pause?: boolean | number;
    voice: Sound | null;
    character: Character | null;
} & Color & Font;

export type SentenceDataRaw = {
    state: SentenceState;
};
export type SentenceState = {
    display: boolean;
};
export type SentenceUserConfig = Partial<Omit<SentenceConfig, "voice"> & {
    voice: Sound | string | null | undefined
}>;
export type DynamicWord = (ctx: ScriptCtx) => DynamicWordResult;
export type DynamicWordResult = string | Word | (string | Word)[];
export type StaticWord<T extends string | DynamicWord = string | DynamicWord> = string | Word<T>;
export type SingleWord = StaticWord | DynamicWord;
export type SentencePrompt = SingleWord[] | SingleWord;

export class Sentence {
    /**@internal */
    static defaultConfig: SentenceConfig = {
        color: "#000",
        pause: true,
        voice: null,
        character: null,
    };
    /**@internal */
    static defaultState: SentenceState = {
        display: true
    };

    /**@internal */
    static isSentence(obj: any): obj is Sentence {
        return obj instanceof Sentence;
    }

    /**@internal */
    static toSentence(prompt: SentencePrompt | Sentence): Sentence {
        return Sentence.isSentence(prompt) ? prompt : new Sentence(prompt);
    }

    /**@internal */
    static format(text: SentencePrompt): Word[] {
        const result: Word[] = [];
        if (Array.isArray(text)) {
            for (let i = 0; i < text.length; i++) {
                result.push(this.formatWord(text[i]));
            }
        } else {
            result.push(this.formatWord(text));
        }
        return result;
    }

    /**@internal */
    static formatWord(word: SingleWord): Word {
        if (Word.isWord(word)) {
            return word;
        }
        return new Word(word);
    }

    /**@internal */
    static formatStaticWord<T extends string | DynamicWord>(
        word: StaticWord<T | string> | StaticWord<T | string>[],
        config?: Partial<WordConfig>
    ): Word<T | string>[] {
        if (Array.isArray(word)) {
            return word.map(w => this.formatStaticWord(w, config)).flat(2);
        }
        return [Word.isWord(word) ? word : new Word<T | string>(word, config)];
    }

    /**@internal */
    readonly text: Word[];
    /**@internal */
    readonly config: SentenceConfig;
    /**@internal */
    state: SentenceState;

    constructor(
        text: SentencePrompt,
        config: SentenceUserConfig = {}
    ) {
        this.text = Sentence.format(text);
        this.config = deepMerge<SentenceConfig>(Sentence.defaultConfig, {
            ...config,
            voice: Sound.toSound(config.voice),
        });
        this.state = safeClone(Sentence.defaultState);
    }

    /**@internal */
    toData(): SentenceDataRaw | null {
        if (deepEqual(this.state, Sentence.defaultState)) {
            return null;
        }
        return {
            state: safeClone(this.state),
        };
    }

    /**@internal */
    fromData(data: SentenceDataRaw) {
        this.state = deepMerge<SentenceState>(this.state, data);
        return this;
    }

    /**@internal */
    toString() {
        return this.text.map(word => word.text).join("");
    }

    /**@internal */
    setCharacter(character: Character | null) {
        this.config.character = character;
        return this;
    }

    /**@internal */
    evaluate(ctx: ScriptCtx): Word<string>[] {
        const words: Word<string>[] = [];
        for (let i = 0; i < this.text.length; i++) {
            const word = this.text[i].evaluate(ctx);
            words.push(...Sentence.formatStaticWord(word));
        }
        return words;
    }

    copy(): Sentence {
        return new Sentence([...this.text], this.config);
    }
}