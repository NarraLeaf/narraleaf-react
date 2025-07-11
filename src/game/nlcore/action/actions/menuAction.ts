import {MenuActionContentType, MenuActionTypes} from "@core/action/actionTypes";
import type {Menu, MenuData} from "@core/elements/menu";
import {GameState} from "@player/gameState";
import {Awaitable, SkipController} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";
import {Story} from "@core/elements/story";
import {LogicAction} from "@core/action/logicAction";
import {ActionSearchOptions} from "@core/types";
import { ActionExecutionInjection } from "@core/action/action";

export class MenuAction<T extends typeof MenuActionTypes[keyof typeof MenuActionTypes] = typeof MenuActionTypes[keyof typeof MenuActionTypes]>
    extends TypedAction<MenuActionContentType, T, Menu> {
    static ActionTypes = MenuActionTypes;

    public executeAction(gameState: GameState, injection: ActionExecutionInjection) {
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                token.cancel();
            }));
        const timeline = gameState.timelines.attachTimeline(awaitable);
        const menu = this.contentNode.getContent() as MenuData;

        let cleanup: (() => void) | null = null;

        const token = gameState.createMenu(menu, (chosen) => {
            const stackModel = gameState.getLiveGame().createStackModel([
                {
                    type: this.type,
                    node: chosen.action[0]?.contentNode ?? null
                }
            ]);
            awaitable.resolve({
                type: this.type,
                node: null,
                wait: {
                    type: "all",
                    stackModels: [stackModel]
                }
            });
            
            cleanup = () => {
                stackModel.reset();
            };

            gameState.gameHistory.updateByToken(id, (result) => {
                if (result && result.element.type === "menu") {
                    result.element.selected = chosen.evaluated;
                    result.isPending = false;
                }
            });
        });
        
        const {id} = gameState.actionHistory.push({
            action: this,
            stackModel: injection.stackModel,
            timeline
        }, () => {
            token.cancel();
            cleanup?.();
        });
        gameState.gameHistory.push({
            token: id,
            action: this,
            element: {
                type: "menu",
                text: token.prompt,
                selected: null,
            },
            isPending: true,
        });

        return [
            {
                type: this.type,
                node: this.contentNode.getChild(),
            },
            awaitable
        ];
    }

    getFutureActions(story: Story, options: ActionSearchOptions): LogicAction.Actions[] {
        const menu = (this.contentNode as ContentNode<MenuActionContentType["menu:action"]>).getContent();
        return [...this.callee._getFutureActions(menu.choices), ...super.getFutureActions(story, options)];
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        const menu: MenuData = (this.contentNode as ContentNode<MenuActionContentType["menu:action"]>).getContent();
        const choices = menu.choices.map(choice => {
            const action = choice.action.map(action => action.stringify(_story, _seen, _strict)).join(";");
            return `{${action}}`;
        });
        return super.stringifyWithContent("Menu", `(${menu.prompt}) {[${choices.join(",")}]}`);
    }
}