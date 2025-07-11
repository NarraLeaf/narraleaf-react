import { LayerActionContentType, LayerActionTypes } from "@core/action/actionTypes";
import { TypedAction } from "@core/action/actions";
import { Layer } from "@core/elements/layer";
import { Values } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

export class LayerAction<T extends Values<typeof LayerActionTypes> = Values<typeof LayerActionTypes>>
    extends TypedAction<LayerActionContentType, T, Layer> {
    static ActionTypes = LayerActionTypes;

    public executeAction(gameState: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        if (this.type === LayerActionTypes.action) {
            return super.executeAction(gameState, injection);
        } else if (this.type === LayerActionTypes.setZIndex) {
            const [zIndex] = (this as LayerAction<typeof LayerActionTypes.setZIndex>).contentNode.getContent();
            const oldZIndex = this.callee.state.zIndex;
            this.callee.state.zIndex = zIndex;

            gameState.actionHistory.push<[number]>({
                action: this,
                stackModel: injection.stackModel
            }, (oldZIndex) => {
                this.callee.state.zIndex = oldZIndex;
            }, [oldZIndex]);

            gameState.stage.update();
            return super.executeAction(gameState, injection);
        }

        throw super.unknownTypeError();
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("LayerAction");
    }
}
