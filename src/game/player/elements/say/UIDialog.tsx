import { Pausing } from "@core/elements/character/pause";
import { Word } from "@core/elements/character/word";
import { Script } from "@lib/game/nlcore/common/elements";
import { GameState } from "@lib/game/nlcore/common/game";
import { Game } from "@lib/game/nlcore/game";
import { EventDispatcher, EventToken, Scheduler } from "@lib/util/data";
import { SayComponent } from "@player/type";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { DialogContext } from "./context";
import { DialogAction, DialogStateType, SayElementProps } from "./type";

type DialogEvents = {
    "event:dialog.requestComplete": [];
    "event:dialog.complete": [];
    "event:dialog.forceSkip": [];
    "event:dialog.onFlush": [];
};

type DialogStateConfig = {
    useTypeEffect: boolean;
    action: DialogAction;
    evaluatedWords: Word<Pausing | string>[];
    gameState: GameState;
};

export class DialogState {
    public static Events: {
        requestComplete: "event:dialog.requestComplete";
        complete: "event:dialog.complete";
        forceSkip: "event:dialog.forceSkip";
        onFlush: "event:dialog.onFlush";
    } = {
            requestComplete: "event:dialog.requestComplete",
            complete: "event:dialog.complete",
            forceSkip: "event:dialog.forceSkip",
            onFlush: "event:dialog.onFlush",
        };

    public readonly config: Readonly<DialogStateConfig>;
    public readonly events: EventDispatcher<DialogEvents> = new EventDispatcher<DialogEvents>();
    private _state: DialogStateType;
    private _count: number;
    private _forceSkipped = false;
    private _idle = false;
    private autoForwardScheduler: Scheduler;

    constructor(config: DialogStateConfig) {
        this.config = config;
        this._state = DialogStateType.Pending;
        this.autoForwardScheduler = new Scheduler();
        this._count = 0;
    }

    public get state() {
        return this._state;
    }

    public get deps(): React.DependencyList {
        return [this._count];
    }

    public isIdle() {
        return this._idle;
    }

    public setIdle(idle: boolean) {
        this._idle = idle;
    }

    /**
     * Only for dialog component to call
     * 
     * Calling this method will request the sentence to be completed  
     * If the sentence is already completed, it will exit the dialog
     */
    public requestComplete() {
        if (this.state === DialogStateType.Ended) {
            this.events.emit(DialogState.Events.complete);
        } else {
            this.events.emit(DialogState.Events.requestComplete);
        }
    }

    /**
     * Only for dialog state to call
     * 
     * Force the sentence to cancel/skip all the tasks
     */
    public forceSkip() {
        if (this.state === DialogStateType.Ended) {
            this.emitComplete();
        } else {
            this._forceSkipped = true;
            this.events.emit(DialogState.Events.forceSkip);
        }
    }

    /**
     * Only for sentence component to call
     * 
     * Only call this method when the sentence is completed
     * Calling this method will schedule the exit of the dialog
     */
    public dispatchComplete() {
        if (this.state === DialogStateType.Ended) {
            return;
        }

        const preference = this.config.gameState.game.preference;
        this._state = DialogStateType.Ended;

        if (preference.getPreference(Game.Preferences.autoForward)) {
            this.scheduleAutoForward();
        }
        this.emitComplete();
        return this;
    }

    public emitComplete(): this {
        this.events.emit(DialogState.Events.complete);
        this.emitFlush();
        return this;
    }

    public isEnded() {
        return this.state === DialogStateType.Ended;
    }

    public setPause(pause: boolean) {
        if (this.isEnded()) return;
        if (pause) {
            this._state = DialogStateType.Paused;
        } else {
            this._state = DialogStateType.Pending;
        }
    }

    public isForceSkipped() {
        return this._forceSkipped;
    }

    public tryScheduleAutoForward() {
        if (!this.isEnded()) return;
        this.scheduleAutoForward();
    }

    public cancelAutoForward() {
        this.autoForwardScheduler.cancelTask();
    }

    public emitFlush(): this {
        this._count++;
        this.events.emit(DialogState.Events.onFlush);
        return this;
    }

    public onFlush(listener: () => void): EventToken {
        return this.events.on(DialogState.Events.onFlush, listener);
    }

    private scheduleAutoForward() {
        const preference = this.config.gameState.game.preference;
        if (!preference.getPreference(Game.Preferences.autoForward) || this.state !== DialogStateType.Ended) return;
        this.autoForwardScheduler
            .cancelTask().scheduleTask(() => {
                this.events.emit(DialogState.Events.complete);
            }, this.config.gameState.game.config.autoForwardDelay / preference.getPreference(Game.Preferences.gameSpeed));
    }


}

export default function PlayerDialog({
    action,
    onFinished,
    useTypeEffect = true,
    gameState,
}: Readonly<SayElementProps>) {
    const words = useMemo(() => action.sentence?.evaluate(Script.getCtx({
        gameState,
    })), [action.sentence, gameState]);
    const [dialogState] = useState(() => new DialogState({
        useTypeEffect,
        action,
        evaluatedWords: words || [],
        gameState,
    }));
    const DialogConstructor: SayComponent = gameState.game.config.dialog;

    /**
     * Listen to the complete event
     */
    useLayoutEffect(() => {
        return dialogState.events.depends([
            dialogState.events.on(DialogState.Events.complete, () => {
                gameState.logger.log("NarraLeaf-React: Say", "Complete", dialogState.isIdle());
                if (dialogState.isIdle()) {
                    onFinished?.(false);
                } else {
                    dialogState.setIdle(true);
                }
            })
        ]).cancel;
    }, []);

    /**
     * Listen to the skip event
     */
    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.skip"], () => {
            if (dialogState.isIdle()) {
                onFinished?.(true);
            } else {
                dialogState.forceSkip();
            }
        }).cancel;
    }, [dialogState]);

    return (
        <>
            <DialogContext value={dialogState} key={action.id}>
                <DialogConstructor />
            </DialogContext>
        </>
    );
}
