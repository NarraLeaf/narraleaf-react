import type { LogicAction } from "./logicAction";
import { ContentNode } from "@core/action/tree/actionTree";
import type { CalledActionResult } from "@core/gameTypes";
import { getCallStack } from "@lib/util/data";
import type { Awaitable } from "@lib/util/data";
import type { GameState } from "@player/gameState";
import type { Story } from "@core/elements/story";
import type { ActionSearchOptions } from "@core/types";
import type { StackModel } from "./stackModel";

export type ActionExecutionInjection = {
    stackModel: StackModel;
};

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
    private _staticId: string | null;

    readonly __stack: string;

    constructor(callee: Callee, type: Type, contentNode: ContentNode<ContentNodeType>) {
        this.callee = callee;
        this.type = type;
        this.contentNode = contentNode;
        this.__stack = getCallStack();
        this._id = "";
        this._staticId = null;
    }

    public executeAction(_state: GameState, _injection: ActionExecutionInjection): ExecutedActionResult {
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

    getStaticId() {
        return this._staticId;
    }

    setStaticId(id: string | null) {
        this._staticId = id;
        return this;
    }

    resolveId(generatedId: string) {
        this.setId(this._staticId || generatedId);
        return this;
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
