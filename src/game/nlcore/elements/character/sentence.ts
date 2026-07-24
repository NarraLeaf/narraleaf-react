import type { Character } from "@core/elements/character";
import { Pause, Pausing } from "@core/elements/character/pause";
import { TextEvent } from "@core/elements/character/textEvent";
import { Word, WordConfig } from "@core/elements/character/word";
import type { ScriptCtx } from "@core/elements/script";
import { Sound } from "@core/elements/sound";
import { Color, Font } from "@core/types";
import { deepMerge, safeClone } from "@lib/util/data";
import { EmptyObject } from "../transition/type";
import type { DialogAvatar } from "@core/elements/character/avatar";

/**
 * User-provided runtime metadata attached to a sentence; not serialized with saves.
 * Use plain serializable values when possible.
 */
export type SentenceMetadata = Record<string, unknown>;

export type SentenceConfig = {
    pause?: boolean | number;
    voice: Sound | null;
    character: Character | null;
    voiceId: string | number | null;
    color?: Color;
    /** Optional runtime-only metadata for UI hooks and integrations */
    metadata?: SentenceMetadata;
    /** Optional per-line dialog avatar override. Use `false` to hide the avatar for this sentence. */
    avatar?: DialogAvatar | false;
} & Font;

/**@internal */
export type SentenceDataRaw = {
    state: SentenceState;
};
/**@internal */
export type SentenceState = EmptyObject;
export type SentenceUserConfig = Partial<Omit<SentenceConfig, "voice"> & {
    voice: Sound | string | null | undefined
}>;
export type DynamicWord = (ctx: ScriptCtx) => DynamicWordResult;
export type DynamicWordResult = string | Word | Pausing | (string | Word | Pausing)[];
export type StaticWord<T extends string | DynamicWord | Pausing | TextEvent = string | DynamicWord | Pausing | TextEvent> =
    string
    | Pausing
    | TextEvent
    | Word<T>;
export type SingleWord = StaticWord | DynamicWord;
export type SentencePrompt = SingleWord[] | SingleWord;

export class Sentence {
    /**@internal */
    static defaultConfig: SentenceConfig = {
        pause: true,
        voice: null,
        character: null,
        voiceId: null,
    };
    /**@internal */
    static defaultState: SentenceState = {};

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
    static formatStaticWord<T extends string | DynamicWord | Pausing | TextEvent>(
        word: StaticWord<T | string> | StaticWord<T | string>[],
        config?: Partial<WordConfig>
    ): Word<T | string | Pausing | TextEvent>[] {
        if (Array.isArray(word)) {
            return word.map(w => this.formatStaticWord(w, config)).flat(2);
        }
        return [Word.isWord(word) ? word : new Word<T | string | Pausing | TextEvent>(word, config)];
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
            || TextEvent.isTextEvent(obj)
            || typeof obj === "function"
        );
    }

    /**@internal */
    readonly text: Word[];
    /**@internal */
    readonly config: SentenceConfig;
    /**@internal */
    state: SentenceState;

    /**
     * Returns runtime-only user metadata from sentence config; undefined when not set.
     */
    getMetadata(): SentenceMetadata | undefined {
        return this.config.metadata;
    }

    /**
     * Build a new sentence from a prompt or mix of words, pauses, and dynamic data.
     * @param text - The sentence prompt used to render the dialogue.
     * @param config - Optional styling, voice, or character overrides.
     * @example
     * ```ts
     * new Sentence(["Hello, ", Word.color("world", "#f00")], {
     *     character,
     * });
     * ```
     */
    constructor(
        text: SentencePrompt,
        config: SentenceUserConfig = {}
    ) {
        this.text = Sentence.format(text);
        this.config = deepMerge<SentenceConfig>(Sentence.defaultConfig, {
            ...config,
            voice: typeof config.voice === "string"
                ? Sound.voice(config.voice)
                : Sound.toSound(config.voice),
        });
        this.state = safeClone(Sentence.defaultState);
    }

    /**@internal */
    toData(): SentenceDataRaw | null {
        return null;
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
    evaluate(ctx: ScriptCtx): Word<string | Pausing | TextEvent>[] {
        const words: Word<string | Pausing | TextEvent>[] = [];
        for (let i = 0; i < this.text.length; i++) {
            const word = this.text[i].evaluate(ctx);
            words.push(...Sentence.formatStaticWord(word));
        }
        return words;
    }

    /**
     * Clone the sentence and reuse its configuration.
     * @example
     * ```ts
     * const sentence = new Sentence("Hello, world");
     * const sentence2 = sentence.copy();
     * ```
     */
    copy(): Sentence {
        return new Sentence([...this.text], this.config);
    }
}
