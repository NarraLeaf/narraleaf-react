import { Pausing } from "@core/elements/character/pause";
import { Word } from "@core/elements/character/word";
import { Script } from "@lib/game/nlcore/common/elements";
import { GameState } from "@lib/game/nlcore/common/game";
import { Game } from "@lib/game/nlcore/game";
import { EventDispatcher, Scheduler } from "@lib/util/data";
import { SayComponent } from "@player/type";
import React, { useEffect, useMemo, useState } from "react";
import { DialogContext } from "./context";
import { DialogAction, DialogStateType, SayElementProps } from "./type";

type DialogEvents = {
    "event:dialog.requestComplete": [];
    "event:dialog.complete": [];
    "event:dialog.forceSkip": [];
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
    } = {
            requestComplete: "event:dialog.requestComplete",
            complete: "event:dialog.complete",
            forceSkip: "event:dialog.forceSkip",
        };

    public readonly config: Readonly<DialogStateConfig>;
    public readonly events: EventDispatcher<DialogEvents> = new EventDispatcher<DialogEvents>();
    private _state: DialogStateType;
    private _count: number;
    private _completeEventConsumed = false;
    private _forceSkipped = false;
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

    /**
     * Only for dialog component to call
     * 
     * Calling this method will request the sentence to be completed  
     * If the sentence is already completed, it will exit the dialog
     */
    public requestComplete() {
        if (this.state === DialogStateType.Ended) {
            if (this._completeEventConsumed) return;
            else this._completeEventConsumed = true;

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
        this._forceSkipped = true;
        this.events.emit(DialogState.Events.forceSkip);
    }

    /**
     * Only for sentence component to call
     * 
     * Only call this method when the sentence is completed
     * Calling this method will schedule the exit of the dialog
     */
    public dispatchComplete() {
        if (this.state === DialogStateType.Ended || this._completeEventConsumed) {
            return;
        }

        const preference = this.config.gameState.game.preference;
        this._state = DialogStateType.Ended;

        if (preference.getPreference(Game.Preferences.autoForward)) {
            this.scheduleAutoForward();
        }
        this.events.emit(DialogState.Events.complete);
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

    useEffect(() => {
        return dialogState.events.on(DialogState.Events.complete, () => {
            onFinished?.(dialogState.isForceSkipped());
        }).cancel;
    }, [dialogState]);

    return (
        <>
            <DialogContext value={dialogState}>
                <DialogConstructor />
            </DialogContext>
        </>
    );
}
