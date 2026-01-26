import {CharacterActionContentType, CharacterActionTypes} from "@core/action/actionTypes";
import type {Character} from "@core/elements/character";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {Sentence} from "@core/elements/character/sentence";
import {TypedAction} from "@core/action/actions";
import {Sound} from "@core/elements/sound";
import { Timeline } from "@lib/game/player/Tasks";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

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

    public executeAction(gameState: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        /**
         * {@link Character.say}
         * Create a game dialog and play voice if available
         */
        if (this.type === CharacterActionTypes.say) {
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => {
                        dialog.cancel();
                    }));
            const timeline = new Timeline(awaitable);
            const sentence = (this.contentNode as ContentNode<Sentence>).getContent();

            // Play voice if available
            const voice = CharacterAction.getVoice(gameState, sentence);
            if (voice) {
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

            // Create dialog
            const dialogId = gameState.idManager.generateId();
            const dialog = gameState.createDialog(dialogId, sentence, () => {
                gameState.gameHistory.resolvePending(id); // accessing id is technically dangerous, but I think it is impossible to happen

                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            });

            // Set last dialog
            gameState.getLiveGame().setLastDialog(dialog.text, this.callee.state.name);

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
                dialog.cancel();
            });
            gameState.gameHistory.push({
                token: id,
                action: this,
                element: {
                    type: "say",
                    text: dialog.text,
                    voice: voice ? voice.getSrc() : null,
                    character: this.callee.state.name,
                },
                isPending: true,
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