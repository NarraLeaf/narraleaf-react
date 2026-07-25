import {VfxActionContentType, VfxActionTypes} from "@core/action/actionTypes";
import {TypedAction} from "@core/action/actions";
import {Vfx} from "@core/elements/vfx";
import {GameState} from "@player/gameState";
import {Awaitable, SkipController, Values} from "@lib/util/data";
import type {CalledActionResult} from "@core/gameTypes";
import {ExposedState, ExposedStateType} from "@player/type";
import {RuntimeGameError} from "@core/common/Utils";
import { ActionExecutionInjection } from "@core/action/action";
import { ActionHistoryPushOptions } from "@core/action/actionHistory";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

export class VfxAction<T extends Values<typeof VfxActionTypes> = Values<typeof VfxActionTypes>>
    extends TypedAction<VfxActionContentType, T, Vfx> {
    static ActionTypes = VfxActionTypes;

    executeAction(gameState: GameState, injection: ActionExecutionInjection): Awaitable<CalledActionResult> {
        const action = this;
        const vfx: Vfx = this.callee;
        const historyProps: ActionHistoryPushOptions = {
            action: action,
            stackModel: injection.stackModel
        };

        if (action.is<VfxAction<"vfx:show">>(VfxAction, "vfx:show")) {
            const [options] = (action as VfxAction<typeof VfxActionTypes.show>).contentNode.getContent();
            const originalVisible = vfx.state.display;
            if (!gameState.isVfxAdded(vfx)) {
                gameState.addVfx(vfx);
                gameState.stage.update();
            }
            vfx.state.display = true;

            gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                vfx.state.display = prevVisible;
            }, [originalVisible]);

            return this.changeStateAsync(gameState, (state) => state.show(options), injection);
        } else if (action.is<VfxAction<"vfx:hide">>(VfxAction, "vfx:hide")) {
            if (!gameState.isVfxAdded(vfx)) {
                gameState.logger.weakWarn("NarraLeaf-React: Vfx", "Hiding a Vfx that is not shown, ignored. (src: " + vfx.config.src + ")");
                return Awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
            }

            const [options] = (action as VfxAction<typeof VfxActionTypes.hide>).contentNode.getContent();
            const originalVisible = vfx.state.display;
            return this.changeStateAsync(gameState, async (state) => {
                await state.hide(options);

                vfx.state.display = false;

                gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                    vfx.state.display = prevVisible;
                }, [originalVisible]);

                gameState.removeVfx(vfx);
                gameState.stage.update();
            }, injection);
        } else if (action.is<VfxAction<"vfx:pause">>(VfxAction, "vfx:pause")) {
            return this.changeState(gameState, (state) => {
                vfx.state.paused = true;
                state.pause();
            }, injection);
        } else if (action.is<VfxAction<"vfx:resume">>(VfxAction, "vfx:resume")) {
            return this.changeState(gameState, (state) => {
                vfx.state.paused = false;
                state.resume();
            }, injection);
        } else if (action.is<VfxAction<"vfx:setRate">>(VfxAction, "vfx:setRate")) {
            return this.changeState(gameState, (state) => state.setRate(action.contentNode.getContent()[0]), injection);
        }

        throw this.unknownTypeError();
    }

    private changeStateBase(
        gameState: GameState,
        handler: (state: ExposedState[ExposedStateType.vfx]) => void | Promise<void>,
        injection: ActionExecutionInjection
    ): Awaitable<CalledActionResult> {
        if (!gameState.isVfxAdded(this.callee)) {
            throw new RuntimeGameError("Vfx is being used before it is added to the game\nUse vfx.show() to add the vfx to the game");
        }

        const vfx: Vfx = this.callee;
        const awaitable = new Awaitable<CalledActionResult>();
        const token = gameState.getExposedStateAsync<ExposedStateType.vfx>(vfx, async (state) => {
            gameState.logger.debug("Vfx Component state exposed", state);

            await handler(state);
            awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
        });
        awaitable.registerSkipController(new SkipController(token.cancel));

        return awaitable;
    }

    private changeState(gameState: GameState, handler: (state: ExposedState[ExposedStateType.vfx]) => void, injection: ActionExecutionInjection) {
        return this.changeStateBase(gameState, handler, injection);
    }

    private changeStateAsync(gameState: GameState, handler: (state: ExposedState[ExposedStateType.vfx]) => Promise<void>, injection: ActionExecutionInjection) {
        return this.changeStateBase(gameState, handler, injection);
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("VfxAction");
    }
}
