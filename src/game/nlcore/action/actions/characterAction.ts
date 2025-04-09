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
        if (this.type === CharacterActionTypes.say) {
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => ({
                        type: this.type as any,
                        node: this.contentNode.getChild()
                    })));
            const timeline = new Timeline(awaitable);

            const sentence = (this.contentNode as ContentNode<Sentence>).getContent();
            const voice = CharacterAction.getVoice(gameState, sentence);

            if (voice) {
                gameState.audioManager.play(voice);
            }

            gameState.createDialog(this.getId(), sentence, () => {
                if (voice) {
                    gameState.audioManager.stop(voice);
                }

                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            });
            gameState.timelines.attachTimeline(timeline);

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