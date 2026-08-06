import {CharacterActionContentType, CharacterActionTypes} from "@core/action/actionTypes";
import type {Character} from "@core/elements/character";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {TypedAction} from "@core/action/actions";
import {Sound} from "@core/elements/sound";
import {Script} from "@core/elements/script";
import { Timeline } from "@lib/game/player/Tasks";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";
import { LiveGame } from "@core/game/liveGame";

export class CharacterAction<T extends typeof CharacterActionTypes[keyof typeof CharacterActionTypes] = typeof CharacterActionTypes[keyof typeof CharacterActionTypes]>
    extends TypedAction<CharacterActionContentType, T, Character> {
    static ActionTypes = CharacterActionTypes;

    static getVoice(state: GameState, sentence: Sentence): Sound | null {
        const scene = state.getLastScene();
        if (!scene) {
            throw new Error("No scene found when trying to play voice");
        }

        const {voiceId, voice} = sentence.config;
        if (!voiceId && !voice) {
            return null;
        }
        return Sound.toSound(scene.getVoice(voiceId) || voice);
    }

    private static endVoiceWithPreference(gameState: GameState, voice: Sound): Awaitable<void> | null {
        const {voiceEndMode, voiceFadeDuration} = gameState.game.preference.getPreferences();
        if (voiceEndMode === "none") {
            return null;
        }
        const duration = voiceEndMode === "fade" ? Math.max(0, voiceFadeDuration) : 0;
        return gameState.audioManager.stop(voice, duration);
    }

    /**
     * The line voice still running past the end of its own sentence, per game.
     *
     * Only `voiceEndMode: "none"` ever leaves one - the other two modes stop the clip at line end.
     * A WeakMap rather than a field on `GameState` because this is bookkeeping between two
     * consecutive `say`s, not state a host or a save has any business seeing.
     */
    private static readonly trailingVoice = new WeakMap<GameState, Sound>();

    /**
     * Cut whatever is still playing from an earlier line before this one's voice starts.
     *
     * "Let it play on" means the clip outlives its own sentence - it does not mean two actors talk
     * at once. Without this, advancing through voiced lines under that mode layered every clip over
     * the last one, and a player clicking quickly could stack three or four. Unvoiced lines pass by
     * without cutting anything, which is the whole point of the mode.
     */
    static cutTrailingVoice(gameState: GameState, next: Sound | null): void {
        const trailing = CharacterAction.trailingVoice.get(gameState);
        if (trailing && trailing !== next && gameState.audioManager.isPlaying(trailing)) {
            gameState.timelines.attachTimeline(gameState.audioManager.stop(trailing, 0));
        }
        if (next) {
            CharacterAction.trailingVoice.set(gameState, next);
        } else {
            CharacterAction.trailingVoice.delete(gameState);
        }
    }

    public executeAction(gameState: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        /**
         * {@link Character.say}
         * Create a game dialog and play voice if available
         */
        if (this.type === CharacterActionTypes.say) {
            let dialogCancel: (() => void) | null = null;
            let dialogText = "";
            let appendedNvlDialogId: string | null = null;
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => {
                        dialogCancel?.();
                    }));
            const timeline = new Timeline(awaitable);
            const sentence = (this.contentNode as ContentNode<Sentence>).getContent();
            const isNvlMode = gameState.isNvlMode();
            const liveGame = gameState.getLiveGame();
            const presentationSnapshot = gameState.createPresentationSnapshot();
            const previousLastDialog = liveGame.lastDialog
                ? {
                    sentence: liveGame.lastDialog.sentence,
                    speaker: liveGame.lastDialog.speaker,
                }
                : null;

            // Play voice if available
            const voice = CharacterAction.getVoice(gameState, sentence);
            if (voice) {
                // A clip left running by "Let it play on" ends here - one voice at a time.
                CharacterAction.cutTrailingVoice(gameState, voice);
                // No `FadeOptions`: the manager's default is the clip's own configured volume, so a
                // voice line mixed down with `Sound.voice({volume})` plays at that volume here.
                const task = gameState.audioManager.play(voice);
                timeline.attachChild(task);
            }
            const voiceEndToken = voice
                ? gameState.events.on(GameState.EventTypes["event:state.player.lineEnd"], () => {
                    const task = CharacterAction.endVoiceWithPreference(gameState, voice);
                    if (task) {
                        gameState.timelines.attachTimeline(task);
                    }
                    voiceEndToken?.cancel();
                })
                : null;

            if (isNvlMode) {
                const actionId = this.getId();
                const restoredDialog = gameState.getActiveNvlDialogForAction(actionId)
                    || gameState.getLatestNvlDialogForAction(actionId);
                const dialogId = restoredDialog?.id || gameState.allocateNvlDialogId(actionId);
                const words = sentence.evaluate(Script.getCtx({ gameState }));
                dialogText = Word.getText(words);

                liveGame.events.emit(LiveGame.EventTypes["event:character.prompt"], {
                    character: sentence.config.character,
                    sentence,
                    text: dialogText,
                });

                let resolved = false;
                const completeLine = () => {
                    if (resolved) {
                        return;
                    }
                    resolved = true;
                    gameState.events.emit(GameState.EventTypes["event:state.player.lineEnd"]);
                    gameState.gameHistory.resolvePending(id);
                    awaitable.resolve({
                        type: this.type,
                        node: this.contentNode.getChild()
                    });
                };

                const { created } = gameState.ensureNvlDialog({
                    id: dialogId,
                    actionId,
                    character: this.callee,
                    sentence,
                    text: dialogText,
                });
                appendedNvlDialogId = dialogId;
                const suppressTyping = gameState.consumeNvlTypingSuppression();
                const phase = created && !suppressTyping ? "typing" : "awaitAdvance";
                gameState.activateNvlDialog(dialogId, phase, !created);

                const advanceToken = gameState.waitForNvlAdvance(dialogId, () => {
                    gameState.settleNvlDialog(dialogId);
                    completeLine();
                });

                dialogCancel = () => {
                    advanceToken.cancel();
                };
            } else {
                const dialogId = gameState.idManager.generateId();
                const dialog = gameState.createDialog(dialogId, sentence, () => {
                    gameState.settleAdvDialog(dialogId);
                    gameState.gameHistory.resolvePending(id);

                    awaitable.resolve({
                        type: this.type,
                        node: this.contentNode.getChild()
                    });
                });
                gameState.beginAdvDialog(dialogId, this.getId());
                dialogText = dialog.text;
                dialogCancel = () => {
                    gameState.settleAdvDialog(dialogId);
                    dialog.cancel();
                };
            }

            // Set last dialog
            liveGame.setLastDialog(dialogText, this.callee.state.name);

            // Attach timeline
            gameState.timelines.attachTimeline(timeline);

            // Push action to action history
            const { id } = gameState.actionHistory.push({
                action: this,
                stackModel: injection.stackModel,
                timeline
            }, () => {
                voiceEndToken?.cancel();
                if (voice && gameState.audioManager.isPlaying(voice)) {
                    const task = CharacterAction.endVoiceWithPreference(gameState, voice);
                    if (task) {
                        timeline.attachChild(task);
                    }
                }
                dialogCancel?.();
                if (appendedNvlDialogId) {
                    gameState.removeNvlDialog(appendedNvlDialogId);
                    gameState.settleNvlDialog(appendedNvlDialogId);
                }
                gameState.restorePresentationSnapshot(presentationSnapshot);
                if (previousLastDialog) {
                    liveGame.setLastDialog(previousLastDialog.sentence, previousLastDialog.speaker);
                } else {
                    liveGame.lastDialog = null;
                }
            });
            gameState.gameHistory.push({
                token: id,
                action: this,
                element: {
                    type: "say",
                    text: dialogText,
                    voice: voice ? voice.getSrc() : null,
                    voiceId: sentence.config.voiceId ?? null,
                    character: this.callee.state.name,
                },
                isPending: true,
                // Snapshot the state at this line so the backlog can be restored to it after a
                // save/load, when the closure-based undo stack is unavailable.
                snapshot: liveGame.captureGameState(),
            });

            return awaitable;
        } else if (this.type === CharacterActionTypes.setName) {
            const oldName = this.callee.state.name;
            this.callee.state.name = (this.contentNode as ContentNode<CharacterActionContentType["character:setName"]>).getContent()[0];

            gameState.actionHistory.push<[oldName: string]>({
                action: this,
                stackModel: injection.stackModel
            }, (oldName) => {
                this.callee.state.name = oldName;
            }, [oldName]);

            return super.executeAction(gameState, injection);
        }

        throw super.unknownTypeError();
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("CharacterAction");
    }
}