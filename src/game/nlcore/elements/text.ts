import {Game} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {Color} from "@core/types";
import {deepMerge, safeClone} from "@lib/util/data";
import {CharacterAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import _ from "lodash";

export type SentenceConfig = {
    pause?: boolean | number;
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
        color: "#fff",
        pause: true,
    };
    static defaultState: SentenceState = {
        display: true
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

    static isSentence(obj: any): obj is Sentence {
        return obj instanceof Sentence;
    }

    static toSentence(prompt: UnSentencePrompt | Sentence): Sentence {
        return Sentence.isSentence(prompt) ? prompt : new Sentence(null, prompt);
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
        if (_.isEqual(this.state, Sentence.defaultState)) {
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
    static defaultConfig: WordConfig = {
        color: "#000"
    };
    text: string;
    config: WordConfig;

    constructor(text: string, config: Partial<WordConfig> = {}) {
        this.text = text;
        this.config = deepMerge<WordConfig>(Word.defaultConfig, config);
    }

    static isWord(obj: any): obj is Word {
        return obj instanceof Word;
    }
}

export type CharacterConfig = {}
export type CharacterStateData = {};

export class Character extends Actionable<
    CharacterStateData
> {
    name: string;
    config: CharacterConfig;

    constructor(name: string, config: CharacterConfig = {}) {
        super(Actionable.IdPrefixes.Text);
        this.name = name;
        this.config = config;
    }

    public say(content: string): Character;
    public say(content: Sentence): Character;
    public say(content: (string | Word)[]): Character;
    public say(content: string | Sentence | (string | Word)[]): Character {
        const sentence: Sentence =
            Array.isArray(content) ?
                new Sentence(this, content, {}) :
                (Sentence.isSentence(content) ? content : new Sentence(this, content, {}));
        const action = new CharacterAction<typeof CharacterAction.ActionTypes.say>(
            this,
            CharacterAction.ActionTypes.say,
            new ContentNode<Sentence>(Game.getIdManager().getStringId()).setContent(sentence)
        );
        this.actions.push(action);
        return this;
    }
}
