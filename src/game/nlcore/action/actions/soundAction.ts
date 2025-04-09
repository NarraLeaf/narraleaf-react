import {SoundActionContentType, SoundActionTypes} from "@core/action/actionTypes";
import type {Sound} from "@core/elements/sound";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";

export class SoundAction<T extends typeof SoundActionTypes[keyof typeof SoundActionTypes] = typeof SoundActionTypes[keyof typeof SoundActionTypes]>
    extends TypedAction<SoundActionContentType, T, Sound> {
    static ActionTypes = SoundActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === SoundActionTypes.play) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:play"]>).getContent();

            return Awaitable.forward(state.audioManager.play(this.callee, options), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());
        } else if (this.type === SoundActionTypes.stop) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:play"]>).getContent();

            return Awaitable.forward(state.audioManager.stop(this.callee, options.duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());
        } else if (this.type === SoundActionTypes.setVolume) {
            const [volume, duration] = (this.contentNode as ContentNode<SoundActionContentType["sound:setVolume"]>).getContent();

            return Awaitable.forward(state.audioManager.setVolume(this.callee, volume, duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());
        } else if (this.type === SoundActionTypes.setRate) {
            const [rate] = (this.contentNode as ContentNode<SoundActionContentType["sound:setRate"]>).getContent();

            return Awaitable.forward(state.audioManager.setRate(this.callee, rate), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());
        } else if (this.type === SoundActionTypes.pause) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:pause"]>).getContent();

            return Awaitable.forward(state.audioManager.pause(this.callee, options.duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());
        } else if (this.type === SoundActionTypes.resume) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:resume"]>).getContent();

            return Awaitable.forward(state.audioManager.resume(this.callee, options.duration), {
                type: this.type ,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());
        }

        throw super.unknownTypeError();
    }
}