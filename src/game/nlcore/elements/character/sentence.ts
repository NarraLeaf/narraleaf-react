import {deepEqual, deepMerge, safeClone} from "@lib/util/data";
import {Sound} from "@core/elements/sound";
import type {Character} from "@core/elements/character";
import {Word, WordConfig} from "@core/elements/character/word";
import {Color, Font} from "@core/types";
import type {ScriptCtx} from "@core/elements/script";
import {Pause, Pausing} from "@core/elements/character/pause";

/**@internal */
export type SentenceConfig = {
    pause?: boolean | number;
    voice: Sound | null;
    character: Character | null;
    voiceId: string | number | null;
} & Color & Font;

/**@internal */
export type SentenceDataRaw = {
    state: SentenceState;
};
/**@internal */
export type SentenceState = {
    display: boolean;
};
export type SentenceUserConfig = Partial<Omit<SentenceConfig, "voice"> & {
    voice: Sound | string | null | undefined
}>;
/**@internal */
export type DynamicWord = (ctx: ScriptCtx) => DynamicWordResult;
/**@internal */
export type DynamicWordResult = string | Word | Pausing | (string | Word | Pausing)[];
/**@internal */
export type StaticWord<T extends string | DynamicWord | Pausing = string | DynamicWord | Pausing> =
    string
    | Pausing
    | Word<T>;
/**@internal */
export type SingleWord = StaticWord | DynamicWord;
/**@internal */
export type SentencePrompt = SingleWord[] | SingleWord;

export class Sentence {
    /**@internal */
    static defaultConfig: SentenceConfig = {
        color: "#000",
        pause: true,
        voice: null,
        character: null,
        voiceId: null,
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
    static formatStaticWord<T extends string | DynamicWord | Pausing>(
        word: StaticWord<T | string> | StaticWord<T | string>[],
        config?: Partial<WordConfig>
    ): Word<T | string | Pausing>[] {
        if (Array.isArray(word)) {
            return word.map(w => this.formatStaticWord(w, config)).flat(2);
        }
        return [Word.isWord(word) ? word : new Word<T | string | Pausing>(word, config)];
    }


    /**@internal */
    static isSentencePrompt(input: any): input is SentencePrompt {
        return Array.isArray(input) ?
            input.every(Sentence.isSingleWord) :
            Sentence.isSingleWord(input);
    }

    /**@internal */
    static isSingleWord(obj: any): obj is SingleWord {
        return (
            typeof obj === "string"
            || Word.isWord(obj)
            || Pause.isPause(obj)
            || typeof obj === "function"
        );
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
    evaluate(ctx: ScriptCtx): Word<string | Pausing>[] {
        const words: Word<string | Pausing>[] = [];
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