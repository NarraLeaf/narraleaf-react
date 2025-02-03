import {TextActionContentType, TextActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {GameState} from "@player/gameState";
import {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {Text} from "@core/elements/displayable/text";
import {ContentNode} from "@core/action/tree/actionTree";
import {Transform} from "@core/elements/transform/transform";

export class TextAction<T extends typeof TextActionTypes[keyof typeof TextActionTypes] = typeof TextActionTypes[keyof typeof TextActionTypes]>
    extends TypedAction<TextActionContentType, T, Text> {
    static ActionTypes = TextActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === TextActionTypes.setText) {
            this.callee.state.text = (this.contentNode as ContentNode<TextActionContentType["text:setText"]>).getContent()[0];
            return super.executeAction(state) as CalledActionResult;
        } else if (this.type === TextActionTypes.setFontSize) {
            this.callee.state.fontSize = (this.contentNode as ContentNode<TextActionContentType["text:setFontSize"]>).getContent()[0];
            const transform = new Transform<any>([], {
                duration: 0,
            });
            const awaitable = new Awaitable<CalledActionResult>()
                .registerSkipController(new SkipController(() => {
                    state.logger.info("NarraLeaf-React: Text Font Size", "Skipped");
                    return super.executeAction(state) as CalledActionResult;
                }));
            const exposed = state.getExposedStateForce(this.callee);
            exposed.applyTransform(transform, () => {
                awaitable.resolve(super.executeAction(state) as CalledActionResult);
                state.stage.next();
            });

            return awaitable;
        }

        throw super.unknownTypeError();
    }
}
