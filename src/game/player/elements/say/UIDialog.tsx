import { CharacterAction } from "@core/action/actions/characterAction";
import { Pausing } from "@core/elements/character/pause";
import { applyDialogAdvance } from "./dialogAdvanceIntent";
import { TextEvent } from "@core/elements/character/textEvent";
import { Word } from "@core/elements/character/word";
import { SoundToken } from "@narraleaf/sound";
import { Script } from "@lib/game/nlcore/common/elements";
import { GameState } from "@lib/game/nlcore/common/game";
import { Game } from "@lib/game/nlcore/game";
import { EventDispatcher, EventToken, Scheduler } from "@lib/util/data";
import { SayComponent } from "@player/type";
import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { DialogContext } from "./context";
import { DialogAction, DialogStateType, SayElementProps } from "./type";
import { useIsPresent } from "motion/react";

type DialogEvents = {
    "event:dialog.requestComplete": [];
    "event:dialog.complete": [force?: boolean];
    "event:dialog.forceSkip": [];
    "event:dialog.onFlush": [];
    "event:dialog.simulateClick": [];
};

type DialogStateConfig = {
    useTypeEffect: boolean;
    action: DialogAction;
    evaluatedWords: Word<Pausing | string | TextEvent>[];
    gameState: GameState;
    suppressInitialAnimation?: boolean;
    /**
     * Persistent per-reveal text-event fire guard. When supplied (NVL entries pass the set stored on
     * their long-lived {@link NvlDialogEntry}), a re-mount of the same line reuses it and so replays
     * neither the sound effects nor the stale expression. Left undefined for ADV, whose dialog state
     * is already memoized per action and falls back to a per-run set.
     */
    firedTextEvents?: Set<TextEvent>;
};

export class DialogState {
    public static Events: {
        requestComplete: "event:dialog.requestComplete";
        complete: "event:dialog.complete";
        forceSkip: "event:dialog.forceSkip";
        onFlush: "event:dialog.onFlush";
        simulateClick: "event:dialog.simulateClick";
    } = {
            requestComplete: "event:dialog.requestComplete",
            complete: "event:dialog.complete",
            forceSkip: "event:dialog.forceSkip",
            onFlush: "event:dialog.onFlush",
            simulateClick: "event:dialog.simulateClick",
        };

    public readonly config: Readonly<DialogStateConfig>;
    public readonly events: EventDispatcher<DialogEvents> = new EventDispatcher<DialogEvents>();
    private _state: DialogStateType;
    private _count: number;
    private _forceSkipped = false;
    private _idle = false;
    private _active = true;
    private autoForwardScheduler: Scheduler;
    /** Drops the listeners on a voice clip auto-forward is currently waiting out. */
    private voiceWaitDisposer: (() => void) | null = null;

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

    public isActive() {
        return this._active;
    }

    /**
     * Hand the line to a box, or take it away from one.
     *
     * A box that becomes active over a line whose text has already finished revealing is idle at
     * once. `_idle` is the latch between "there is nothing left to reveal" and "the next advance
     * settles the line", and the `complete` event that used to be its only source is answered only
     * by a box that was active at the instant the text finished. A line that finished while its box
     * was displaced - another scene's dialog on top of it, a panel over the stage, the moment of
     * retention after the line before it - therefore came back with the latch down, and the first
     * advance the player spent went on raising it instead of settling the line. The latch now
     * follows the fact rather than who was watching when it happened.
     *
     * A line that has *not* finished revealing is untouched: its box coming back must still reveal
     * the rest of it before a click can settle it.
     */
    public setActive(active: boolean) {
        this._active = active;
        if (!active) {
            this.cancelAutoForward();
        } else if (this.state === DialogStateType.Ended) {
            this._idle = true;
        }
        return this;
    }

    /**
     * Only for dialog component to call
     * 
     * Calling this method will request the sentence to be completed  
     * If the sentence is already completed, it will exit the dialog
     */
    public requestComplete() {
        if (!this._active) return;
        if (this.state === DialogStateType.Ended) {
            this.safeEmit(DialogState.Events.complete);
        } else {
            this.safeEmit(DialogState.Events.requestComplete);
        }
    }

    /**
     * Only for dialog state to call
     * 
     * Force the sentence to cancel/skip all the tasks
     */
    public forceSkip() {
        if (!this._active) return;
        if (this.state === DialogStateType.Ended) {
            this.emitComplete();
        } else {
            this._forceSkipped = true;
            this.safeEmit(DialogState.Events.forceSkip);
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
            this.config.gameState.logger.weakWarn("DialogState", "Dialog is already ended. Cannot dispatch complete.");
            return;
        }

        if (!this.events.hasListeners(DialogState.Events.complete)) {
            this.config.gameState.logger.weakWarn("DialogState", "No listener for complete event. Cannot dispatch complete.");
            return;
        }

        const preference = this.config.gameState.game.preference;
        this._state = DialogStateType.Ended;
        this.config.gameState.completeAdvDialogTyping(this.config.action.id);

        if (preference.getPreference(Game.Preferences.autoForward)) {
            this.scheduleAutoForward();
        }
        this.emitComplete();
        return this;
    }

    public emitComplete(): this {
        this.safeEmit(DialogState.Events.complete);
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
        this.releaseVoiceWait();
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

    public safeEmit(event: keyof DialogEvents, ...args: DialogEvents[keyof DialogEvents]): this {
        if (this.events.emit(event, ...args) === 0) {
            this.config.gameState.logger.weakWarn("DialogState", `Failed to emit event: ${event}. Target Component is not mounted.`);
        }
        return this;
    }

    /**
     * Auto-forward waits for the line's voice before it starts counting.
     *
     * Typing finishing and the voice finishing are unrelated events - a fully-typed line whose actor
     * is still mid-sentence is the normal case, not an edge one. Counting `autoForwardDelay` from the
     * typing meant auto mode talked over the cast on every line longer than the delay, which is the
     * one thing auto mode exists to avoid. The delay still applies afterwards, so the pause a player
     * configured is a pause *after* the line rather than a race against it.
     *
     * A line with no voice, or one whose clip has already ended, schedules exactly as before.
     */
    private scheduleAutoForward() {
        const preference = this.config.gameState.game.preference;
        if (!this._active || !preference.getPreference(Game.Preferences.autoForward) || this.state !== DialogStateType.Ended) return;

        this.releaseVoiceWait();
        const voiceToken = this.getPlayingVoiceToken();
        if (!voiceToken) {
            this.scheduleAutoForwardDelay();
            return;
        }

        // Held rather than scheduled: `cancelAutoForward` has to be able to drop this the same way it
        // drops a pending timer, or a dialog the player left would still advance when its clip ended.
        const proceed = () => {
            this.releaseVoiceWait();
            this.scheduleAutoForwardDelay();
        };
        voiceToken.once("ended", proceed);
        voiceToken.once("stop", proceed);
        this.voiceWaitDisposer = () => {
            voiceToken.off("ended", proceed);
            voiceToken.off("stop", proceed);
        };
    }

    private scheduleAutoForwardDelay() {
        const preference = this.config.gameState.game.preference;
        // Re-checked rather than trusted from the caller: between the clip starting and it ending the
        // player may have turned auto off, left the dialog, or advanced by hand.
        if (!this._active || !preference.getPreference(Game.Preferences.autoForward) || this.state !== DialogStateType.Ended) return;
        this.autoForwardScheduler
            .cancelTask().scheduleTask(() => {
                this.events.emit(DialogState.Events.simulateClick);
            }, this.config.gameState.game.config.autoForwardDelay / preference.getPreference(Game.Preferences.gameSpeed));
    }

    /** The token of this line's voice while it is still playing, or null - no voice, or already done. */
    private getPlayingVoiceToken(): SoundToken | null {
        const sentence = this.config.action.sentence;
        if (!sentence) return null;
        try {
            const voice = CharacterAction.getVoice(this.config.gameState, sentence);
            if (!voice) return null;
            const token = this.config.gameState.audioManager.getToken(voice);
            return token && token.isPlaying() ? token : null;
        } catch {
            // No scene, or a voice id the scene cannot resolve. Auto-forward must not become the thing
            // that breaks a line.
            return null;
        }
    }

    private releaseVoiceWait() {
        const dispose = this.voiceWaitDisposer;
        this.voiceWaitDisposer = null;
        dispose?.();
    }
}

export default function PlayerDialog({
    action,
    onFinished,
    useTypeEffect = true,
    gameState,
    active = true,
}: Readonly<SayElementProps>) {
    const isPresent = useIsPresent();
    const isActive = active && isPresent;
    const finishedRef = useRef(false);
    const previousActionRef = useRef(action);
    const isActionReplacement = previousActionRef.current !== action;
    const words = useMemo(() => action.sentence?.evaluate(Script.getCtx({
        gameState,
    })), [action.sentence, gameState]);
    /**
     * The state belongs to the line, so it is rebuilt exactly when the line is - and no more often.
     *
     * The only thing that can ever mark a line's text fully revealed is the typing task, and that
     * task belongs to `Texts`, which is keyed on `action.id`. Rebuilding the state for anything
     * other than a new action therefore leaves the new state with no task of its own: the task that
     * is running reports its completion to the state that was thrown away, so the new one never
     * reaches `Ended`, is never idle, and every advance forwards to a task that has already
     * finished. The line stays fully drawn on screen and no click, key press or auto-forward can
     * settle it again.
     *
     * `useTypeEffect` used to be able to do that. It is read from a ref that every advance in the
     * scene writes (skipping a line asks the next one not to type), so it changes under a line that
     * is already on screen. Whether a line types is decided when it starts revealing, which is what
     * this state records; a line already revealing does not change its mind. `evaluatedWords` is
     * derived from the same action and moves with it.
     */
    const dialogState = useMemo(() => new DialogState({
        useTypeEffect,
        action,
        evaluatedWords: words || [],
        gameState,
        suppressInitialAnimation: isActionReplacement,
    }), [action, gameState]);
    const DialogConstructor: SayComponent = gameState.game.config.dialog;
    const finish = useCallback((skiped?: boolean) => {
        if (!isActive || finishedRef.current) {
            return;
        }
        finishedRef.current = true;
        onFinished?.(skiped);
    }, [isActive, onFinished]);

    useLayoutEffect(() => {
        finishedRef.current = false;
    }, [dialogState]);

    useLayoutEffect(() => {
        previousActionRef.current = action;
    }, [action]);

    useLayoutEffect(() => {
        dialogState.setActive(isActive);
        return () => {
            dialogState.setActive(false);
        };
    }, [dialogState, isActive]);

    /**
     * Listen to the complete event
     */
    useLayoutEffect(() => {
        gameState.logger.debug("NarraLeaf-React: Say", "dialogState", dialogState);
        
        return dialogState.events.on(DialogState.Events.complete, (force?: boolean) => {
            gameState.logger.log("NarraLeaf-React: Say", "Complete", dialogState.isIdle());
            if (!isActive) {
                return;
            }
            if (dialogState.isIdle() || force) {
                finish(false);
            } else {
                dialogState.setIdle(true);
            }
        }).cancel;
    }, [dialogState, finish, gameState, isActive]);

    /**
     * Listen to the skip event, and to a click on the stage.
     *
     * Both mean "get on with it": a key press arrives as `skip`, a click on the stage as
     * `stageClick`. The ADV dialog used to listen only to the first, so clicking did nothing at all
     * — the click was recognised, the event was emitted, and no one advanced the line. NVL dialogs
     * have always listened to both.
     *
     * What an advance means is {@link applyDialogAdvance}'s to say, and an unforced one
     * means exactly what a click on the box itself means: `requestComplete`. Answering it here
     * instead - force-skipping a line still revealing, settling a revealed one as though the
     * player had been skipping - is what made a click on the stage walk straight past a `Pause`,
     * and what made one tap of the skip key ask every line after it not to type.
     */
    useLayoutEffect(() => {
        const advance = (force?: boolean) => {
            applyDialogAdvance(dialogState, { active: isActive, forced: force === true });
        };

        const skipToken = gameState.events.on(GameState.EventTypes["event:state.player.skip"], advance);
        const stageToken = gameState.events.on(
            GameState.EventTypes["event:state.player.stageClick"], () => advance(false)
        );

        return () => {
            skipToken.cancel();
            stageToken.cancel();
        };
    }, [dialogState, gameState, isActive]);

    return (
        <>
            <DialogContext value={dialogState}>
                <DialogConstructor />
            </DialogContext>
        </>
    );
}
