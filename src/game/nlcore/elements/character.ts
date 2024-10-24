import {LogicAction} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {Color} from "@core/types";
import {deepMerge, DeepPartial} from "@lib/util/data";
import {Actionable} from "@core/action/actionable";
import {Chained, Proxied} from "@core/action/chain";
import {Sentence, SentencePrompt, SentenceUserConfig} from "@core/elements/character/sentence";
import {CharacterAction} from "@core/action/actions/characterAction";

export type CharacterConfig = {} & Color;
export type CharacterStateData = {
    name: string;
};
export type CharacterState = {
    name: string;
};

export class Character extends Actionable<
    CharacterStateData,
    Character
> {
    /**@internal */
    static defaultConfig: CharacterConfig = {
        color: "#000",
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
     * @chainable
     */
    public say(content: string, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: Sentence): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: SentencePrompt, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public say(content: SentencePrompt | Sentence, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>> {
        const sentence: Sentence =
            Array.isArray(content) ?
                new Sentence(content, {
                    ...(config || {}),
                    character: this
                }) :
                (Sentence.isSentence(content) ? content : new Sentence(content, {
                    ...(config || {}),
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
}


