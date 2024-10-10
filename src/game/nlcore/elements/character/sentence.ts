import {deepEqual, deepMerge, safeClone} from "@lib/util/data";
import {Sound} from "@core/elements/sound";
import type {Character} from "@core/elements/character";
import {UnSentencePrompt} from "@core/elements/character";
import {Word} from "@core/elements/character/word";
import {Color} from "@core/types";

export type SentenceConfig = {
    pause?: boolean | number;
    voice: Sound | null;
} & Color;

export type SentenceDataRaw = {
    state: SentenceState;
};
export type SentenceState = {
    display: boolean;
};
export type SentenceUserConfig = Partial<Omit<SentenceConfig, "voice"> & {
    voice: Sound | string | null | undefined
}>;

export class Sentence {
    /**@internal */
    static defaultConfig: SentenceConfig = {
        color: "#000",
        pause: true,
        voice: null,
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
    static toSentence(prompt: UnSentencePrompt | Sentence): Sentence {
        return Sentence.isSentence(prompt) ? prompt : new Sentence(null, prompt);
    }

    /**@internal */
    readonly character: Character | null;
    /**@internal */
    readonly text: Word[];
    /**@internal */
    readonly config: SentenceConfig;
    /**@internal */
    state: SentenceState;

    constructor(
        character: Character | null,
        text: (string | Word)[] | (string | Word),
        config: SentenceUserConfig = {}
    ) {
        this.character = character;
        this.text = this.format(text);
        this.config = deepMerge<SentenceConfig>(Sentence.defaultConfig, {
            ...config,
            voice: Sound.toSound(config.voice),
        });
        this.state = safeClone(Sentence.defaultState);
    }

    /**@internal */
    format(text: (string | Word)[] | (string | Word)): Word[] {
        const result: Word[] = [];
        if (Array.isArray(text)) {
            for (let i = 0; i < text.length; i++) {
                if (Word.isWord(text[i])) {
                    result.push(text[i] as Word);
                } else {
                    result.push(new Word(text[i] as string));
                }
            }
        } else {
            result.push(Word.isWord(text) ? text : new Word(text));
        }
        return result;
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
}