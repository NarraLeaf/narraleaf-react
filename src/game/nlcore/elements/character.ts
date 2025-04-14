import {LogicAction} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {Color} from "@core/types";
import {crossCombine, deepMerge, DeepPartial} from "@lib/util/data";
import {Actionable} from "@core/action/actionable";
import {Chained, Proxied} from "@core/action/chain";
import {Sentence, SentencePrompt, SentenceUserConfig, SingleWord} from "@core/elements/character/sentence";
import {CharacterAction} from "@core/action/actions/characterAction";

export type CharacterConfig = {
    color?: Color;
};
/**@internal */
export type CharacterStateData = {
    name: string;
};
/**@internal */
export type CharacterState = {
    name: string;
};

export interface Character {
    (content: string, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;

    (content: Sentence): Proxied<Character, Chained<LogicAction.Actions>>;

    (content: SentencePrompt, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;

    (texts: TemplateStringsArray, ...words: SingleWord[]): Proxied<Character, Chained<LogicAction.Actions>>;
}

export class Character extends Actionable<
    CharacterStateData,
    Character
> {
    /**@internal */
    static defaultCharacterColor: Color = "#000";
    /**@internal */
    static defaultConfig: CharacterConfig = {
    };
    /**@internal */
    readonly config: CharacterConfig;
    /**@internal */
    state: CharacterState;

    constructor(name: string | null, config: DeepPartial<CharacterConfig> = {}) {
        super();
        this.config = deepMerge<CharacterConfig>(Character.defaultConfig, config);
        this.state = {
            name: name || "",
        };
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
     * @example
     * ```typescript
     * character.say`Hello, ${Word.color("world", "#f00")}!`;
     * ```
     * @chainable
     */
    public say(content: string, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: Sentence): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: SentencePrompt, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(texts: TemplateStringsArray, ...words: SingleWord[]): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(
        contentOrText: SentencePrompt | Sentence | TemplateStringsArray,
        configOrArg0?: SentenceUserConfig | Sentence | SingleWord,
        ...words: SingleWord[]
    ): Proxied<Character, Chained<LogicAction.Actions>> {
        if (Array.isArray(contentOrText)
            && contentOrText.every(text => typeof text === "string")
            && [configOrArg0, ...words].length > 0
            && [configOrArg0, ...words].every(word => Sentence.isSingleWord(word))
        ) {
            const plainTexts = contentOrText as string[];
            const inserts = Sentence.format([configOrArg0, ...words] as SingleWord[]);

            const sentence = new Sentence(crossCombine(plainTexts, inserts), {
                character: this
            });
            const action = new CharacterAction<typeof CharacterAction.ActionTypes.say>(
                this.chain(),
                CharacterAction.ActionTypes.say,
                new ContentNode<Sentence>().setContent(sentence)
            );

            return this.chain(action);
        }
        const config = (configOrArg0 || {}) as SentenceUserConfig;
        const content = contentOrText as SentencePrompt | Sentence;
        const sentence: Sentence =
            Array.isArray(content) ?
                new Sentence(content, {
                    ...config,
                    character: this
                }) :
                (Sentence.isSentence(content) ? content : new Sentence(content, {
                    ...config,
                    character: this
                }))
                    .copy();
        sentence.setCharacter(this);

        const action = new CharacterAction<typeof CharacterAction.ActionTypes.say>(
            this.chain(),
            CharacterAction.ActionTypes.say,
            new ContentNode<Sentence>().setContent(sentence)
        );
        return this.chain(action);
    }

    public setName(name: string): Proxied<Character, Chained<LogicAction.Actions>> {
        const action = new CharacterAction<typeof CharacterAction.ActionTypes.setName>(
            this.chain(),
            CharacterAction.ActionTypes.setName,
            new ContentNode<[string]>().setContent([name])
        );
        return this.chain(action);
    }

    public apply(content: string, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public apply(content: Sentence): Proxied<Character, Chained<LogicAction.Actions>>;
    public apply(content: SentencePrompt, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public apply(texts: TemplateStringsArray, ...words: SingleWord[]): Proxied<Character, Chained<LogicAction.Actions>>;
    public apply(
        contentOrText: SentencePrompt | Sentence | TemplateStringsArray,
        configOrArg0?: SentenceUserConfig | Sentence | SingleWord,
        ...words: SingleWord[]
    ): Proxied<Character, Chained<LogicAction.Actions>> {
        // eslint-disable-next-line prefer-spread
        return this.say.apply(this, [contentOrText, configOrArg0, ...words] as any);
    }
}
