import { LogicAction } from "./logicAction";
import { ContentNode } from "@core/action/tree/actionTree";
import type { CalledActionResult } from "@core/gameTypes";
import { Awaitable, getCallStack } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { Story } from "@core/elements/story";
import { ActionSearchOptions } from "@core/types";

export type ExecutedActionResult = CalledActionResult
    | Awaitable<CalledActionResult, any>
    | (CalledActionResult | Awaitable<CalledActionResult, any>)[]
    | null;

export class Action<ContentNodeType = any, Callee = LogicAction.GameElement, Type extends string = any> {
    static ActionTypes = {
        action: "action",
    };
    callee: Callee;
    type: Type;
    contentNode: ContentNode<ContentNodeType>;
    _id: string;

    readonly __stack: string;

    constructor(callee: Callee, type: Type, contentNode: ContentNode<ContentNodeType>) {
        this.callee = callee;
        this.type = type;
        this.contentNode = contentNode;
        this.__stack = getCallStack();
        this._id = "";
    }

    public executeAction(_state: GameState): ExecutedActionResult {
        return {
            type: this.type as any,
            node: this.contentNode.getChild(),
        };
    }

    getId() {
        return this._id;
    }

    setId(id: string) {
        this._id = id;
    }

    setContent(content: ContentNodeType) {
        this.contentNode.setContent(content);
        return this;
    }

    setContentNode(contentNode: ContentNode<ContentNodeType>) {
        this.contentNode = contentNode;
        return this;
    }

    getFutureActions(_story: Story, _options: ActionSearchOptions): LogicAction.Actions[] {
        const action = this.contentNode.getChild();
        return ((action && action.action) ? [action.action] : []);
    }
}