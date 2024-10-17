import {TextActionContentType, TextActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {GameState} from "@player/gameState";
import {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {Text} from "@core/elements/text";
import {ContentNode} from "@core/action/tree/actionTree";

export class TextAction<T extends typeof TextActionTypes[keyof typeof TextActionTypes] = typeof TextActionTypes[keyof typeof TextActionTypes]>
    extends TypedAction<TextActionContentType, T, Text> {
    static ActionTypes = TextActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === TextActionTypes.init) {
            const lastScene = state.findElementByDisplayable(this.callee);
            if (lastScene) {
                state.disposeDisplayable(this.callee, lastScene.scene);
            }

            const scene = (this.contentNode as ContentNode<TextActionContentType["text:init"]>).getContent()[0];
            state.createDisplayable(this.callee, scene);

            const awaitable = new Awaitable<CalledActionResult, any>(v => v);

            this.callee.events.any("event:text.init").then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (([
            TextActionTypes.show,
            TextActionTypes.hide,
            TextActionTypes.applyTransform
        ] as T[]).includes(this.type)) {
            const awaitable =
                new Awaitable<CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => {
                        if (this.type === TextActionTypes.hide) {
                            this.callee.state.display = false;
                        }
                        return super.executeAction(state) as CalledActionResult;
                    }));
            const transform = (this.contentNode as ContentNode<TextActionContentType["text:show"]>).getContent()[0];

            if (this.type === TextActionTypes.show) {
                this.callee.state.display = true;
                state.stage.update();
            }

            state.animateText(Text.EventTypes["event:text.applyTransform"], this.callee, [
                transform
            ], () => {
                if (this.type === TextActionTypes.hide) {
                    this.callee.state.display = false;
                }
                awaitable.resolve(super.executeAction(state) as CalledActionResult);
            });
            return awaitable;
        } else if (this.type === TextActionTypes.setText) {
            this.callee.state.text = (this.contentNode as ContentNode<TextActionContentType["text:setText"]>).getContent()[0];
            return super.executeAction(state) as CalledActionResult;
        }

        throw super.unknownType();
    }
}
