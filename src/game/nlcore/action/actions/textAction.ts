import {TextActionContentType, TextActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {GameState} from "@player/gameState";
import {CalledActionResult} from "@core/gameTypes";
import {Awaitable} from "@lib/util/data";
import {Text} from "@core/elements/displayable/text";
import {ContentNode} from "@core/action/tree/actionTree";
import {ExposedStateType} from "@player/type";

export class TextAction<T extends typeof TextActionTypes[keyof typeof TextActionTypes] = typeof TextActionTypes[keyof typeof TextActionTypes]>
    extends TypedAction<TextActionContentType, T, Text> {
    static ActionTypes = TextActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === TextActionTypes.setText) {
            const originalText = this.callee.state.text;
            this.callee.state.text = (this.contentNode as ContentNode<TextActionContentType["text:setText"]>).getContent()[0];
            state.getExposedStateForce<ExposedStateType.text>(this.callee).flush();

            state.actionHistory.push<[string]>(this, (prevText) => {
                this.callee.state.text = prevText;
            }, [originalText]);

            return super.executeAction(state);
        } else if (this.type === TextActionTypes.setFontSize) {
            const originalFontSize = this.callee.state.fontSize;
            this.callee.state.fontSize = (this.contentNode as ContentNode<TextActionContentType["text:setFontSize"]>).getContent()[0];
            state.getExposedStateForce<ExposedStateType.text>(this.callee).flush();

            state.actionHistory.push<[number]>(this, (prevFontSize) => {
                this.callee.state.fontSize = prevFontSize;
            }, [originalFontSize]);

            return super.executeAction(state);
        }

        throw super.unknownTypeError();
    }
}
