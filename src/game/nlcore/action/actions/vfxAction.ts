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

        if (action.is<VfxAction<"vfx:preload">>(VfxAction, "vfx:preload")) {
            // Nothing is waited for and nothing becomes visible: this puts the element in the
            // document so the browser can start fetching and decoding, which is the whole cost a
            // later `show` would otherwise pay while the player watches.
            if (gameState.isVfxAdded(vfx)) {
                return Awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
            }
            gameState.addVfx(vfx);
            gameState.stage.update();

            gameState.actionHistory.push(historyProps, () => {
                if (gameState.isVfxAdded(vfx)) {
                    gameState.removeVfx(vfx);
                    gameState.stage.update();
                }
            });

            return Awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
        } else if (action.is<VfxAction<"vfx:show">>(VfxAction, "vfx:show")) {
            const [options] = (action as VfxAction<typeof VfxActionTypes.show>).contentNode.getContent();
            const originalVisible = vfx.state.display;
            const originalOwner = gameState.getVfxOwner(vfx);
            if (!gameState.isVfxAdded(vfx)) {
                gameState.addVfx(vfx);
                gameState.stage.update();
            } else {
                // Shown again from another scene - one this overlay's scene has called - it joins the
                // scene showing it, as a sprite or a clip shown there would. Left with the caller it
                // would be parked with the caller, and the show would put nothing on screen.
                const running = gameState.getLastScene();
                if (running && running !== originalOwner) {
                    gameState.setVfxOwner(vfx, running);
                    gameState.stage.update();
                }
            }
            vfx.state.display = true;

            gameState.actionHistory.push<[boolean]>(historyProps, (prevVisible) => {
                vfx.state.display = prevVisible;
                if (originalOwner && gameState.getVfxOwner(vfx) !== originalOwner) {
                    gameState.setVfxOwner(vfx, originalOwner);
                    gameState.stage.update();
                }
            }, [originalVisible]);

            return this.changeStateAsync(gameState, (state) => state.show(options), injection);
        } else if (action.is<VfxAction<"vfx:hide">>(VfxAction, "vfx:hide")) {
            // Not shown covers both ways: never put on stage at all, and on stage but invisible -
            // which is what a preloaded or an already-hidden overlay is. Either way there is nothing
            // to fade out, and fading zero to zero would spend the duration on nothing.
            if (!gameState.isVfxAdded(vfx) || !vfx.state.display) {
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

                // The element STAYS on the stage, paused at zero opacity. Removing it would throw
                // away a warm decoder for a clip the story is likely to want again, and a paused
                // video costs no frame time - see `Vfx.hide`.
            }, injection);
        } else if (action.is<VfxAction<"vfx:pause">>(VfxAction, "vfx:pause")) {
            if (!gameState.isVfxAdded(vfx)) {
                return this.skipOffStage(gameState, injection, "Pausing");
            }
            return this.changeState(gameState, (state) => {
                vfx.state.paused = true;
                state.pause();
            }, injection);
        } else if (action.is<VfxAction<"vfx:resume">>(VfxAction, "vfx:resume")) {
            if (!gameState.isVfxAdded(vfx)) {
                return this.skipOffStage(gameState, injection, "Resuming");
            }
            return this.changeState(gameState, (state) => {
                vfx.state.paused = false;
                state.resume();
            }, injection);
        } else if (action.is<VfxAction<"vfx:setRate">>(VfxAction, "vfx:setRate")) {
            if (!gameState.isVfxAdded(vfx)) {
                return this.skipOffStage(gameState, injection, "Setting the rate of");
            }
            return this.changeState(gameState, (state) => state.setRate(action.contentNode.getContent()[0]), injection);
        }

        throw this.unknownTypeError();
    }

    /**
     * A pause, a resume or a rate change aimed at an overlay that is no longer on the stage.
     *
     * An overlay leaves the stage with the scene that started it, so a handle kept in script and used
     * after that scene is gone has nothing to talk to. It does nothing and says so - what `hide` on an
     * overlay that is not shown has always done, and what a clip's transport does - rather than
     * stopping the story.
     */
    private skipOffStage(gameState: GameState, injection: ActionExecutionInjection, doing: string): Awaitable<CalledActionResult> {
        gameState.logger.weakWarn("NarraLeaf-React: Vfx", doing + " a Vfx that is not on the stage, ignored. (src: " + this.callee.config.src + ")");
        return Awaitable.resolve(super.executeAction(gameState, injection) as CalledActionResult);
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
