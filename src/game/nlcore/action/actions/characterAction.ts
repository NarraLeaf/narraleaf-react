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

    public executeAction(gameState: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
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

            // Create dialog
            const dialogId = gameState.idManager.generateId();
            const dialog = gameState.createDialog(dialogId, sentence, () => {
                if (voice) {
                    const task = gameState.audioManager.stop(voice);
                    timeline.attachChild(task);
                }

                gameState.gameHistory.resolvePending(id); // accessing id is technically dangerous, but I think it is impossible to happen

                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            });

            // Attach timeline
            gameState.timelines.attachTimeline(timeline);

            // Push action to action history
            const { id } = gameState.actionHistory.push(this, () => {
                if (voice && gameState.audioManager.isPlaying(voice)) {
                    const task = gameState.audioManager.stop(voice);
                    timeline.attachChild(task);
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

            gameState.actionHistory.push<[oldName: string]>(this, (oldName) => {
                this.callee.state.name = oldName;
            }, [oldName]);

            return super.executeAction(gameState);
        }

        throw super.unknownTypeError();
    }
}