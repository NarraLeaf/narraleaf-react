import { TextActionContentType, TextActionTypes } from "@core/action/actionTypes";
import { TypedAction } from "@core/action/actions";
import { ContentNode } from "@core/action/tree/actionTree";
import { Text } from "@core/elements/displayable/text";
import { GameState } from "@player/gameState";
import { ExposedStateType } from "@player/type";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { ActionHistoryPushOptions } from "@core/action/actionHistory";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

export class TextAction<T extends typeof TextActionTypes[keyof typeof TextActionTypes] = typeof TextActionTypes[keyof typeof TextActionTypes]>
    extends TypedAction<TextActionContentType, T, Text> {
    static ActionTypes = TextActionTypes;

    public executeAction(state: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        const historyProps: ActionHistoryPushOptions = {
            action: this,
            stackModel: injection.stackModel
        };
        if (this.type === TextActionTypes.setText) {
            const originalText = this.callee.state.text;
            this.callee.state.text = (this.contentNode as ContentNode<TextActionContentType["text:setText"]>).getContent()[0];
            state.getExposedStateForce<ExposedStateType.text>(this.callee).flush();

            state.actionHistory.push<[string]>(historyProps, (prevText) => {
                this.callee.state.text = prevText;
            }, [originalText]);

            return super.executeAction(state, injection);
        } else if (this.type === TextActionTypes.setFontSize) {
            const originalFontSize = this.callee.state.fontSize;
            this.callee.state.fontSize = (this.contentNode as ContentNode<TextActionContentType["text:setFontSize"]>).getContent()[0];
            state.getExposedStateForce<ExposedStateType.text>(this.callee).flush();

            state.actionHistory.push<[number]>(historyProps, (prevFontSize) => {
                this.callee.state.fontSize = prevFontSize;
            }, [originalFontSize]);

            return super.executeAction(state, injection);
        }

        throw super.unknownTypeError();
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("TextAction");
    }
}
