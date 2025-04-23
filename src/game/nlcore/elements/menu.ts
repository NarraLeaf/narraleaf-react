import {deepMerge} from "@lib/util/data";
import {ContentNode, RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {Actionable} from "@core/action/actionable";
import {Chained, Proxied} from "@core/action/chain";
import {Sentence, SentencePrompt} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {MenuAction} from "@core/action/actions/menuAction";
import Actions = LogicAction.Actions;
import GameElement = LogicAction.GameElement;

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type MenuConfig = {};
export type MenuChoice = {
    action: ChainedActions;
    prompt: SentencePrompt | Sentence;
};

/**@internal */
type ChainedAction = Proxied<GameElement, Chained<LogicAction.Actions>>;
/**@internal */
type ChainedActions = (ChainedAction | ChainedAction[] | Actions | Actions[])[];

export type Choice = {
    action: Actions[];
    prompt: Sentence;
};

export type MenuData = {
    prompt: Sentence;
    choices: Choice[];
}

export class Menu extends Actionable<any, Menu> {
    /**@internal */
    static defaultConfig: MenuConfig = {};
    /**@internal */
    static targetAction = MenuAction;
    /**@internal */
    readonly prompt: Sentence;
    /**@internal */
    readonly config: MenuConfig;
    /**@internal */
    protected choices: Choice[] = [];

    /**
     * Create a menu with a prompt
     * @param prompt - The prompt to display to the player
     * @returns A new menu
     */
    public static prompt(prompt: SentencePrompt | Sentence, config: MenuConfig = {}): Menu {
        return new Menu(prompt, config);
    }

    constructor(prompt: SentencePrompt, config?: MenuConfig);
    constructor(prompt: Sentence, config?: MenuConfig);
    constructor(prompt: SentencePrompt | Sentence, config: MenuConfig);
    constructor(prompt: SentencePrompt | Sentence, config: MenuConfig = {}) {
        super();
        this.prompt = Sentence.isSentence(prompt) ? prompt : new Sentence(prompt);
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
    public choose(prompt: Sentence, action: ChainedActions): Proxied<Menu, Chained<LogicAction.Actions>>;
    public choose(prompt: SentencePrompt, action: ChainedActions): Proxied<Menu, Chained<LogicAction.Actions>>;
    public choose(arg0: Sentence | MenuChoice | SentencePrompt, arg1?: ChainedActions): Proxied<Menu, Chained<LogicAction.Actions>> {
        const chained = this.chain();
        if (Sentence.isSentence(arg0) && arg1) {
            chained.choices.push({prompt: Sentence.toSentence(arg0), action: Chained.toActions(arg1)});
        } else if ((Word.isWord(arg0) || Array.isArray(arg0) || typeof arg0 === "string") && arg1) {
            chained.choices.push({prompt: Sentence.toSentence(arg0), action: Chained.toActions(arg1)});
        } else if (typeof arg0 === "object" && "prompt" in arg0 && "action" in arg0) {
            chained.choices.push({prompt: Sentence.toSentence(arg0.prompt), action: Chained.toActions(arg0.action)});
        } else {
            console.warn("No valid choice added to menu, ", {
                arg0,
                arg1
            });
        }
        return chained;
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
                prompt: choice.prompt
            };
        });
    }
}

