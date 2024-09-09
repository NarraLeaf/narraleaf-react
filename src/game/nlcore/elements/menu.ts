import {Game} from "../game";
import {deepMerge} from "@lib/util/data";
import {Sentence, Word} from "./text";
import {ContentNode, RenderableNode} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {MenuAction} from "@core/action/actions";
import {Actionable} from "@core/action/actionable";
import Actions = LogicAction.Actions;

export type MenuConfig = {};
export type MenuChoice = {
    action: Actions[];
    prompt: UnSentencePrompt | Sentence;
};

type UnSentencePrompt = (string | Word)[] | (string | Word);
export type Choice = {
    action: Actions[];
    prompt: Sentence;
};

export type MenuData = {
    prompt: Sentence;
    choices: Choice[];
}

export class Menu extends Actionable {
    static defaultConfig: MenuConfig = {};
    static targetAction = MenuAction;
    prompt: Sentence;
    readonly config: MenuConfig;
    protected choices: Choice[] = [];

    constructor(prompt: UnSentencePrompt, config?: MenuConfig);
    constructor(prompt: Sentence, config?: MenuConfig);
    constructor(prompt: UnSentencePrompt | Sentence, config: MenuConfig = {}) {
        super(Actionable.IdPrefixes.Menu);
        this.prompt = Sentence.isSentence(prompt) ? prompt : new Sentence(null, prompt);
        this.config = deepMerge<MenuConfig>(Menu.defaultConfig, config);
    }

    public choose(choice: MenuChoice): this;
    public choose(prompt: Sentence, action: (Actions | Actions[])[]): this;
    public choose(prompt: UnSentencePrompt, action: (Actions | Actions[])[]): this;
    public choose(arg0: Sentence | MenuChoice | UnSentencePrompt, arg1?: (Actions | Actions[])[]): this {
        if (Sentence.isSentence(arg0) && arg1) {
            this.choices.push({prompt: Sentence.toSentence(arg0), action: arg1.flat(2)});
        } else if ((Word.isWord(arg0) || Array.isArray(arg0) || typeof arg0 === "string") && arg1) {
            this.choices.push({prompt: Sentence.toSentence(arg0), action: arg1.flat(2)});
        } else if (typeof arg0 === "object" && "prompt" in arg0 && "action" in arg0) {
            this.choices.push({prompt: Sentence.toSentence(arg0.prompt), action: arg0.action.flat(2)});
        } else {
            console.warn("No valid choice added to menu, ", {
                arg0,
                arg1
            });
        }
        return this;
    }

    construct(actions: Actions[], lastChild?: RenderableNode, parentChild?: RenderableNode): Actions[] {
        for (let i = 0; i < actions.length; i++) {
            let node = actions[i].contentNode;
            let child = actions[i + 1]?.contentNode;
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

    toActions(): MenuAction<"menu:action">[] {
        const output = [
            new MenuAction(
                this,
                MenuAction.ActionTypes.action,
                new ContentNode<MenuData>(
                    Game.getIdManager().getStringId()
                ).setContent({
                    prompt: this.prompt,
                    choices: this.constructChoices()
                })
            )
        ];
        this.choices = [];
        return output;
    }

    _getFutureActions(choices: Choice[]): LogicAction.Actions[] {
        return choices.map(choice => choice.action).flat(2);
    }

    private constructChoices(): Choice[] {
        return this.choices.map(choice => {
            return {
                action: this.construct(choice.action),
                prompt: choice.prompt
            };
        });
    }
}

