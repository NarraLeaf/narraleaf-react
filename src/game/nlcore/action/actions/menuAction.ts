import {MenuActionContentType, MenuActionTypes} from "@core/action/actionTypes";
import type {Menu, MenuData} from "@core/elements/menu";
import {GameState} from "@player/gameState";
import {Awaitable} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";

export class MenuAction<T extends typeof MenuActionTypes[keyof typeof MenuActionTypes] = typeof MenuActionTypes[keyof typeof MenuActionTypes]>
    extends TypedAction<MenuActionContentType, T, Menu> {
    static ActionTypes = MenuActionTypes;

    public executeAction(state: GameState) {
        const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
        const menu = this.contentNode.getContent() as MenuData;

        state.createMenu(menu, v => {
            const lastChild = state.game.getLiveGame().getCurrentAction()?.contentNode.getChild() || null;
            if (lastChild) {
                v.action[v.action.length - 1]?.contentNode.addChild(lastChild);
            }
            awaitable.resolve({
                type: this.type as any,
                node: v.action[0].contentNode
            });
        });
        return awaitable;
    }

    getFutureActions() {
        const menu = (this.contentNode as ContentNode<MenuActionContentType["menu:action"]>).getContent();
        return [...this.callee._getFutureActions(menu.choices), ...super.getFutureActions()];
    }
}