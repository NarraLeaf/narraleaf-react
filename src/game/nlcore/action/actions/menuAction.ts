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

export class MenuAction<T extends typeof MenuActionTypes[keyof typeof MenuActionTypes] = typeof MenuActionTypes[keyof typeof MenuActionTypes]>
    extends TypedAction<MenuActionContentType, T, Menu> {
    static ActionTypes = MenuActionTypes;

    public executeAction(state: GameState) {
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                token.cancel();
            }));
        const timeline = state.timelines.attachTimeline(awaitable);
        const menu = this.contentNode.getContent() as MenuData;

        const token = state.createMenu(menu, (chosen) => {
            const lastChild = state.game.getLiveGame().getCurrentAction()?.contentNode.getChild() || null;
            if (lastChild) {
                chosen.action[chosen.action.length - 1]?.contentNode.addChild(lastChild);
            }
            awaitable.resolve({
                type: this.type as any,
                node: chosen.action[0].contentNode
            });
            state.gameHistory.updateByToken(id, (result) => {
                if (result && result.element.type === "menu") {
                    result.element.selected = chosen.evaluated;
                    result.isPending = false;
                }
            });
        });
        
        const {id} = state.actionHistory.push(this, () => {
            token.cancel();
        }, [], timeline);
        state.gameHistory.push({
            token: id,
            action: this,
            element: {
                type: "menu",
                text: token.prompt,
                selected: null,
            },
            isPending: true,
        });

        return awaitable;
    }

    getFutureActions(story: Story, options: ActionSearchOptions): LogicAction.Actions[] {
        const menu = (this.contentNode as ContentNode<MenuActionContentType["menu:action"]>).getContent();
        return [...this.callee._getFutureActions(menu.choices), ...super.getFutureActions(story, options)];
    }
}