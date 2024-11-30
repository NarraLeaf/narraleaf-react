import {CharacterActionContentType, CharacterActionTypes} from "@core/action/actionTypes";
import type {Character} from "@core/elements/character";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {Sentence} from "@core/elements/character/sentence";
import {TypedAction} from "@core/action/actions";
import {SoundAction} from "@core/action/actions/soundAction";

export class CharacterAction<T extends typeof CharacterActionTypes[keyof typeof CharacterActionTypes] = typeof CharacterActionTypes[keyof typeof CharacterActionTypes]>
    extends TypedAction<CharacterActionContentType, T, Character> {
    static ActionTypes = CharacterActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === CharacterActionTypes.say) {
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => ({
                        type: this.type as any,
                        node: this.contentNode.getChild()
                    })));

            const sentence = (this.contentNode as ContentNode<Sentence>).getContent();
            const voice = sentence.config.voice;

            if (voice) {
                SoundAction.initSound(state, voice);
                state.playSound(voice, () => {
                    state.stopSound(voice);
                });
            }

            state.createText(this.getId(), sentence, () => {
                if (voice) {
                    state.stopSound(voice);
                }

                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
            });

            return awaitable;
        } else if (this.type === CharacterActionTypes.setName) {
            this.callee.state.name = (this.contentNode as ContentNode<CharacterActionContentType["character:setName"]>).getContent()[0];
            return super.executeAction(state);
        }

        throw super.unknownType();
    }
}