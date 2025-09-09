import {deepMerge} from "@lib/util/data";
import {ContentNode, RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Actionable} from "@core/action/actionable";
import {Chained, Proxied} from "@core/action/chain";
import {Sentence, SentencePrompt} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {MenuAction} from "@core/action/actions/menuAction";
import Actions = LogicAction.Actions;
import { ActionStatements } from "./type";
import { Narrator } from "./character";
import { Lambda } from "./condition";
import { StaticScriptWarning } from "../common/Utils";

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type MenuConfig = {};
export type MenuChoice = {
    action: ActionStatements;
    prompt: SentencePrompt | Sentence;
    config?: ChoiceConfig;
};

export type Choice = {
    action: Actions[];
    prompt: Sentence;
    config: ChoiceConfig;
};

export type MenuData = {
    prompt: Sentence | null;
    choices: Choice[];
};

export type ChoiceConfig = {
    disabled?: Lambda<boolean>;
    hidden?: Lambda<boolean>;
};

export class Menu extends Actionable<any, Menu> {
    /**@internal */
    static defaultConfig: MenuConfig = {};
    /**@internal */
    static targetAction = MenuAction;
    /**@internal */
    readonly prompt: Sentence | null;
    /**@internal */
    readonly config: MenuConfig;
    /**@internal */
    protected choices: Choice[] = [];

    /**
     * Create a menu with a prompt
     * @param prompt - The prompt to display to the player
     * @returns A new menu
     */
    public static prompt(prompt: SentencePrompt | Sentence | null | undefined, config: MenuConfig = {}): Menu {
        return new Menu(
            prompt !== undefined ? prompt : null,
            config
        );
    }

    public static choose(arg0: Sentence | MenuChoice | SentencePrompt, arg1?: ActionStatements): Proxied<Menu, Chained<LogicAction.Actions>> {
        const menu = new Menu(null, {});
        return menu.choose(arg0, arg1);
    }

    constructor(prompt: SentencePrompt, config?: MenuConfig);
    constructor(prompt: Sentence, config?: MenuConfig);
    constructor(prompt: SentencePrompt | Sentence, config: MenuConfig);
    constructor(prompt: null, config?: MenuConfig);
    constructor(prompt: SentencePrompt | Sentence | null, config: MenuConfig);
    constructor(prompt: SentencePrompt | Sentence | null, config: MenuConfig = {}) {
        super();
        this.prompt = Sentence.isSentence(prompt) ? prompt :
            prompt === null ? null : new Sentence(prompt);
        this.config = deepMerge<MenuConfig>(Menu.defaultConfig, config);
    }

    /**
     * Add a choice to the menu
     * @example
     * menu.choose("Go left", [
     *     character.say("I went left")
     * ]);
     * @chainable
     */
    public choose(choice: MenuChoice): Proxied<Menu, Chained<LogicAction.Actions>>;
    public choose(prompt: Sentence, action: ActionStatements): Proxied<Menu, Chained<LogicAction.Actions>>;
    public choose(prompt: SentencePrompt, action: ActionStatements): Proxied<Menu, Chained<LogicAction.Actions>>;
    public choose(arg0: Sentence | MenuChoice | SentencePrompt, arg1?: ActionStatements): Proxied<Menu, Chained<LogicAction.Actions>>;
    public choose(arg0: Sentence | MenuChoice | SentencePrompt, arg1?: ActionStatements): Proxied<Menu, Chained<LogicAction.Actions>> {
        const chained = this.chain();
        if (Sentence.isSentence(arg0) && arg1) {
            chained.choices.push({prompt: Sentence.toSentence(arg0), action: this.narrativeToActions(arg1), config: {}});
        } else if ((Word.isWord(arg0) || Array.isArray(arg0) || typeof arg0 === "string") && arg1) {
            chained.choices.push({prompt: Sentence.toSentence(arg0), action: this.narrativeToActions(arg1), config: {}});
        } else if (typeof arg0 === "object" && "prompt" in arg0 && "action" in arg0) {
            chained.choices.push({
                prompt: Sentence.toSentence(arg0.prompt),
                action: this.narrativeToActions(arg0.action),
                config: arg0.config ?? {}
            });
        } else {
            console.warn("No valid choice added to menu, ", {
                arg0,
                arg1
            });
        }
        return chained;
    }

    /**
     * Magic method to hide the last choice if the condition is true
     * @example
     * ```ts
     * menu.choose(
     *   // ...
     * ).hideIf(persis.isTrue("flag"));
     * ```
     * 
     * **Note**: This method will override the last choice's config.hidden
     */
    public hideIf(condition: Lambda<boolean>): Proxied<Menu, Chained<LogicAction.Actions>> {
        const lastChoice = this.choices[this.choices.length - 1];
        if (!lastChoice) {
            throw new StaticScriptWarning("Trying to configure the last choice of a menu, but no choice added. This may be caused by calling `menu.hideIf` before `menu.choose`");
        }
        lastChoice.config.hidden = Lambda.from(condition);
        return this.chain();
    }

    /**
     * Magic method to disable the last choice if the condition is true
     * @example
     * ```ts
     * menu.choose(
     *   // ...
     * ).disableIf(persis.isTrue("flag"));
     * ```
     */
    public disableIf(condition: Lambda<boolean>): Proxied<Menu, Chained<LogicAction.Actions>> {
        const lastChoice = this.choices[this.choices.length - 1];
        if (!lastChoice) {
            throw new StaticScriptWarning("Trying to configure the last choice of a menu, but no choice added. This may be caused by calling `menu.disableIf` before `menu.choose`");
        }
        lastChoice.config.disabled = Lambda.from(condition);
        return this.chain();
    }

    /**@internal */
    public override fromChained(chained: Proxied<Menu, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return [
            new MenuAction(
                this.chain(),
                MenuAction.ActionTypes.action,
                new ContentNode<MenuData>().setContent({
                    prompt: this.prompt,
                    choices: chained.constructChoices()
                })
            )
        ];
    }

    /**@internal */
    _getFutureActions(choices: Choice[]): LogicAction.Actions[] {
        return choices.map(choice => choice.action[0] || null)
            .filter(action => action !== null);
    }

    /**@internal */
    narrativeToActions(statements: ActionStatements): LogicAction.Actions[] {
        return this.constructNodes(statements.flatMap(statement => {
            if (typeof statement === "string") {
                return Narrator.say(statement).getActions();
            }
            return Chained.toActions([statement]);
        }));
    }

    /**@internal */
    private constructNodes(actions: Actions[], lastChild?: RenderableNode, parentChild?: RenderableNode): Actions[] {
        for (let i = 0; i < actions.length; i++) {
            const node = actions[i].contentNode;
            const child = actions[i + 1]?.contentNode;
            if (child) {
                node.setChild(child);
            }
            if (i === this.choices.length - 1 && lastChild) {
                node.setChild(lastChild);
            }
            if (i === 0 && parentChild) {
                parentChild.setChild(node);
            }
        }
        return actions;
    }

    /**@internal */
    private constructChoices(): Choice[] {
        return this.choices.map(choice => {
            return {
                action: this.constructNodes(choice.action),
                prompt: choice.prompt,
                config: choice.config ?? {}
            };
        });
    }
}

