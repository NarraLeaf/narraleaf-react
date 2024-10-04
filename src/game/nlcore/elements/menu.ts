import {deepMerge} from "@lib/util/data";
import {Sentence, Word} from "./text";
import {ContentNode, RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {MenuAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import {Chained, Proxied} from "@core/action/chain";
import Actions = LogicAction.Actions;
import GameElement = LogicAction.GameElement;

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type MenuConfig = {};
export type MenuChoice = {
    action: ChainedActions;
    prompt: UnSentencePrompt | Sentence;
};

type ChainedAction = Proxied<GameElement, Chained<LogicAction.Actions>>;
type ChainedActions = (ChainedAction | ChainedAction[] | Actions | Actions[])[];

type UnSentencePrompt = (string | Word)[] | (string | Word);
export type Choice = {
    action: Actions[];
    prompt: Sentence;
};

export type MenuData = {
    prompt: Sentence;
    choices: Choice[];
}

export class Menu extends Actionable<any, Menu> {
    static defaultConfig: MenuConfig = {};
    static targetAction = MenuAction;
    /**@internal */
    readonly prompt: Sentence;
    /**@internal */
    readonly config: MenuConfig;
    /**@internal */
    protected choices: Choice[] = [];

    constructor(prompt: UnSentencePrompt, config?: MenuConfig);
    constructor(prompt: Sentence, config?: MenuConfig);
    constructor(prompt: UnSentencePrompt | Sentence, config: MenuConfig = {}) {
        super();
        this.prompt = Sentence.isSentence(prompt) ? prompt : new Sentence(null, prompt);
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
    public choose(prompt: UnSentencePrompt, action: ChainedActions): Proxied<Menu, Chained<LogicAction.Actions>>;
    public choose(arg0: Sentence | MenuChoice | UnSentencePrompt, arg1?: ChainedActions): Proxied<Menu, Chained<LogicAction.Actions>> {
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
        return choices.map(choice => choice.action).flat(2);
    }

    /**@internal */
    private constructNodes(actions: Actions[], lastChild?: RenderableNode, parentChild?: RenderableNode): Actions[] {
        for (let i = 0; i < actions.length; i++) {
            const node = actions[i].contentNode;
            const child = actions[i + 1]?.contentNode;
            if (child) {
                node.setInitChild(child);
            }
            if (i === this.choices.length - 1 && lastChild) {
                node.setInitChild(lastChild);
            }
            if (i === 0 && parentChild) {
                parentChild.setInitChild(node);
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

