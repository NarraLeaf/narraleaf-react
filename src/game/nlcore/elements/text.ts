import {Game, LogicAction} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {color, Color} from "@core/types";
import {deepEqual, deepMerge, DeepPartial, safeClone} from "@lib/util/data";
import {CharacterAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import type {Sound} from "@core/elements/sound";
import {Chained, Proxied} from "@core/action/chain";

export type SentenceConfig = {
    pause?: boolean | number;
    voice: Sound | string | null | undefined;
} & Color;
export type WordConfig = {} & Color;

export type SentenceDataRaw = {
    state: SentenceState;
};
export type SentenceState = {
    display: boolean;
};

type UnSentencePrompt = (string | Word)[] | (string | Word);

export class Sentence {
    static defaultConfig: SentenceConfig = {
        color: "#000",
        pause: true,
        voice: null,
    };
    static defaultState: SentenceState = {
        display: true
    };

    static isSentence(obj: any): obj is Sentence {
        return obj instanceof Sentence;
    }

    static toSentence(prompt: UnSentencePrompt | Sentence): Sentence {
        return Sentence.isSentence(prompt) ? prompt : new Sentence(null, prompt);
    }

    id: string;
    character: Character | null;
    text: Word[];
    config: SentenceConfig;
    state: SentenceState;

    constructor(character: Character | null, text: (string | Word)[] | (string | Word), config: Partial<SentenceConfig> = {}) {
        this.character = character;
        this.text = this.format(text);
        this.config = deepMerge<SentenceConfig>(Sentence.defaultConfig, config);
        this.id = Game.getIdManager().getStringId();
        this.state = safeClone(Sentence.defaultState);
    }

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

    toData(): SentenceDataRaw | null {
        if (deepEqual(this.state, Sentence.defaultState)) {
            return null;
        }
        return {
            state: safeClone(this.state),
        };
    }

    fromData(data: SentenceDataRaw) {
        this.state = deepMerge<SentenceState>(this.state, data);
        return this;
    }

    toString() {
        return this.text.map(word => word.text).join("");
    }
}

export class Word {
    static defaultConfig: Partial<WordConfig> = {};
    static defaultColor: color = "#000";

    static isWord(obj: any): obj is Word {
        return obj instanceof Word;
    }

    text: string;
    config: Partial<WordConfig>;

    constructor(text: string, config: Partial<WordConfig> = {}) {
        this.text = text;
        this.config = deepMerge<Partial<WordConfig>>(Word.defaultConfig, config);
    }
}

export enum CharacterMode {
    // noinspection SpellCheckingInspection
    "adv" = "adv",
    "nvl" = "nvl"
}

export type CharacterConfig = {
    mode: CharacterMode;
}
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type CharacterStateData = {};

export class Character extends Actionable<
    CharacterStateData,
    Character
> {
    static Modes = CharacterMode;
    static defaultConfig: CharacterConfig = {
        mode: CharacterMode.adv,
    };
    readonly name: string | null;
    readonly config: CharacterConfig;

    constructor(name: string | null, config: DeepPartial<CharacterConfig> = {}) {
        super(Actionable.IdPrefixes.Text);
        this.name = name;
        this.config = deepMerge<CharacterConfig>({}, Character.defaultConfig, config);
    }

    /**
     * Say something
     * @example
     * ```typescript
     * character.say("Hello, world!");
     * ```
     * @example
     * ```typescript
     * character
     *     .say("Hello, world!")
     *     .say("Hello, world!");
     * ```
     * @example
     * ```typescript
     * character.say(new Sentence(character, [
     *     "Hello, ",
     *     new Word("world", {color: "#f00"}), // Some words can be colored
     * ]));
     */
    public say(content: string): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: Sentence): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: (string | Word)[]): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: string | Sentence | (string | Word)[]): Proxied<Character, Chained<LogicAction.Actions>> {
        const sentence: Sentence =
            Array.isArray(content) ?
                new Sentence(this, content, {}) :
                (Sentence.isSentence(content) ? content : new Sentence(this, content, {}));
        const action = new CharacterAction<typeof CharacterAction.ActionTypes.say>(
            this,
            CharacterAction.ActionTypes.say,
            new ContentNode<Sentence>(Game.getIdManager().getStringId()).setContent(sentence)
        );
        return this.chain(action);
    }
}


