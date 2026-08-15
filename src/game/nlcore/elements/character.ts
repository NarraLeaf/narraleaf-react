import {LogicAction} from "../game";
import {ContentNode} from "@core/action/tree/actionTree";
import {Color} from "@core/types";
import {crossCombine, deepMerge, DeepPartial, Serializer} from "@lib/util/data";
import {Actionable} from "@core/action/actionable";
import {Chained, Proxied} from "@core/action/chain";
import {Sentence, SentencePrompt, SentenceUserConfig, SingleWord} from "@core/elements/character/sentence";
import {CharacterAction} from "@core/action/actions/characterAction";
import type {
    CharacterPortraitConfig,
    DialogAvatar,
} from "@core/elements/character/avatar";
import type { Image } from "@core/elements/displayable/image";

export type CharacterConfig = {
    color?: Color;
    avatar?: DialogAvatar | false;
    portraits: (Image | CharacterPortraitConfig)[];
};
/**
 * What a save carries for one character.
 *
 * Named and shaped like every other element's save payload ({@link import("@core/elements/sound").SoundDataRaw},
 * `LayerDataRaw`, `ImageDataRaw`) so that the section a serializer owns stays one level down and
 * there is somewhere to put anything a character comes to carry besides its state.
 */
export type CharacterDataRaw = {
    state: Record<string, any>;
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
    CharacterDataRaw,
    Character
> {
    /**@internal */
    static defaultCharacterColor: Color = "#000";
    /**@internal */
    static defaultConfig: CharacterConfig = {
        portraits: [],
    };
    /**@internal */
    static StateSerializer = new Serializer<CharacterState>();
    /**@internal */
    readonly config: CharacterConfig;
    /**@internal */
    state: CharacterState;
    /**
     * The name the script gave this character, kept apart from the live one.
     *
     * `Character.setName` writes to `state.name`, so once a line has renamed a character the state
     * no longer says what the author wrote — and `reset()` (which `LiveGame.newGame()` runs over
     * every element, and `deserialize()` runs over each element a save names) has to hand back the
     * authored name, not whatever the last playthrough left behind.
     * @internal
     */
    private readonly authoredName: string;

    constructor(name: string | null, config: DeepPartial<CharacterConfig> = {}) {
        super();
        this.config = deepMerge<CharacterConfig>(Character.defaultConfig, config);
        this.authoredName = name || "";
        this.state = this.getInitialState();

        const self = this;
        const callable = function (
            contentOrText: TemplateStringsArray | SentencePrompt | Sentence,
            configOrArg0?: SentenceUserConfig | Sentence | SingleWord,
            ...words: SingleWord[]
        ) {
            return self.call(contentOrText, configOrArg0, ...words);
        };
        return new Proxy(callable as any, {
            get(_, prop) {
                return (self as any)[prop];
            },
            set(_, prop, value) {
                (self as any)[prop] = value;
                return true;
            },
            has(_, prop) {
                return prop in self;
            },
        });
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
     * @example
     * ```typescript
     * character`Hello, ${Word.color("world", "#f00")}!`;
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

    /**
     * Set the display name that will appear in the dialog box for future actions.
     * @param name - The new label to show above the next sentences.
     * @returns The character instance to keep chaining dialogs.
     * @chainable
     * @example
     * ```ts
     * character.setName("Alice (angry)").say("What do you want?");
     * ```
     */
    public setName(name: string): Proxied<Character, Chained<LogicAction.Actions>> {
        const action = new CharacterAction<typeof CharacterAction.ActionTypes.setName>(
            this.chain(),
            CharacterAction.ActionTypes.setName,
            new ContentNode<[string]>().setContent([name])
        );
        return this.chain(action);
    }

    /**
     * Set the avatar strategy used by dialogs for this character.
     * @param avatar - Image source, resolver, `false` to hide by default, or `null` for no avatar.
     * @example
     * ```ts
     * character.setAvatar("alice-avatar.png");
     * ```
     */
    public setAvatar(avatar: DialogAvatar | false | null): this {
        this.config.avatar = avatar === null ? null : avatar;
        return this;
    }

    /**
     * Register a portrait image as a possible visual source for this character's dialog avatar.
     * @param image - The stage image that represents the character.
     * @param config - Optional avatar override for this portrait.
     * @example
     * ```ts
     * character.addPortrait(aliceSprite, { avatar: "alice-happy-avatar.png" });
     * ```
     */
    public addPortrait(image: Image, config: { avatar?: DialogAvatar } = {}): this {
        this.config.portraits.push({
            image,
            avatar: config.avatar,
        });
        return this;
    }

    /**
     * Replace all portrait bindings for this character.
     * @param portraits - Stage images or image/avatar pairs.
     */
    public setPortraits(portraits: (Image | CharacterPortraitConfig)[]): this {
        this.config.portraits = [...portraits];
        return this;
    }

    public apply(content: string, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public apply(content: Sentence): Proxied<Character, Chained<LogicAction.Actions>>;
    public apply(content: SentencePrompt, config?: SentenceUserConfig): Proxied<Character, Chained<LogicAction.Actions>>;
    public apply(texts: TemplateStringsArray, ...words: SingleWord[]): Proxied<Character, Chained<LogicAction.Actions>>;
    
    /**
     * Alias of `say` intended for single-sentence tag usage.
     *
     * NOTE: some bundlers (e.g., Webpack) cannot keep this method chainable when used as a tag function, so prefer
     * the full `.say` call if you need to continue the chain.
     * @example
     * ```ts
     * scene.action([character`Hello, ${Word.color("Alice", "#f00")}!`]);
     * ```
     * @chainable
     */
    public apply(
        contentOrText: SentencePrompt | Sentence | TemplateStringsArray,
        configOrArg0?: SentenceUserConfig | Sentence | SingleWord,
        ...words: SingleWord[]
    ): Proxied<Character, Chained<LogicAction.Actions>> {
        // eslint-disable-next-line prefer-spread
        return this.say.apply(this, [contentOrText, configOrArg0, ...words] as any);
    }

    /**
     * Call method to implement tag function functionality
     * @internal
     */
    /**
     * Implements the documented tag-function shorthand (`character\`...\``).
     *
     * The tag delegates to `say`, so it is not chainable when packaged by tools that break this pattern.
     * @internal
     */
    public call(
        this: Character,
        contentOrText: SentencePrompt | Sentence | TemplateStringsArray,
        configOrArg0?: SentenceUserConfig | Sentence | SingleWord,
        ...words: SingleWord[]
    ): Proxied<Character, Chained<LogicAction.Actions>> {
        if (Array.isArray(contentOrText) && "raw" in contentOrText) {
            // This is a template string call
            if (configOrArg0 && Sentence.isSingleWord(configOrArg0)) {
                return this.say(contentOrText as TemplateStringsArray, configOrArg0 as SingleWord, ...words);
            }
            return this.say(contentOrText as TemplateStringsArray);
        }
        if (typeof contentOrText === "string") {
            // This is a string call
            return this.say(contentOrText, configOrArg0 as SentenceUserConfig);
        }
        if (Sentence.isSentence(contentOrText)) {
            // This is a Sentence call
            return this.say(contentOrText);
        }
        // This is a SentencePrompt call
        return this.say(contentOrText as SentencePrompt, configOrArg0 as SentenceUserConfig);
    }

    /**
     * A character's name is runtime state — {@link Character.setName} rewrites it mid-scene, which is
     * how a story shows an unfamiliar speaker as "???" and reveals who they are later. Without this,
     * `Story.getAllElementStates` dropped every character from the save (it discards elements whose
     * `toData` returns nothing), and loading quietly put the authored name back: the player who saved
     * after the reveal reloaded into "???" again.
     * @internal
     */
    override toData(): CharacterDataRaw | null {
        return {
            state: Character.StateSerializer.serialize(this.state),
        };
    }

    /**@internal */
    override fromData(data: CharacterDataRaw): this {
        this.state = Character.StateSerializer.deserialize(data.state);
        return this;
    }

    /**@internal */
    override reset(): this {
        this.state = this.getInitialState();
        return this;
    }

    /**@internal */
    private getInitialState(): CharacterState {
        return {
            name: this.authoredName,
        };
    }
}

export const Narrator = new Character(null);
