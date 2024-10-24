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

    static initSound(state: GameState, sound: Sound) {
        if (!sound.getPlaying()) {
            sound.setPlaying(
                new (state.getHowl())(sound.getHowlOptions())
            );
        }
    }

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === SoundActionTypes.play) {
            SoundAction.initSound(state, this.callee);
            if (!this.callee.getPlaying()) {
                throw new Error("Howl is not initialized");
            }
            if (this.callee.config.sync && !this.callee.config.loop) {
                const awaitable = new Awaitable<CalledActionResult, any>(v => v);
                state.playSound(this.callee, () => {
                    state.stopSound(this.callee);
                    awaitable.resolve({
                        type: this.type as any,
                        node: this.contentNode?.getChild()
                    });
                });
                return awaitable;
            } else {
                state.playSound(this.callee, () => {
                    state.stopSound(this.callee);
                });
                return super.executeAction(state);
            }
        } else if (this.type === SoundActionTypes.stop) {
            state.stopSound(this.callee);
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.fade) {
            const [{
                start,
                end,
                duration
            }] = (this.contentNode as ContentNode<SoundActionContentType["sound:fade"]>).getContent();
            if (this.callee.getPlaying()) {
                const startValue = start === undefined ? this.callee.getPlaying()!.volume() : start;
                this.callee.getPlaying()!.fade(startValue, end, duration, this.callee.getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.setVolume) {
            const [volume] = (this.contentNode as ContentNode<SoundActionContentType["sound:setVolume"]>).getContent();
            if (this.callee.getPlaying()) {
                this.callee.getPlaying()!.volume(volume, this.callee.getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.setRate) {
            const [rate] = (this.contentNode as ContentNode<SoundActionContentType["sound:setRate"]>).getContent();
            if (this.callee.getPlaying()) {
                this.callee.getPlaying()!.rate(rate, this.callee.getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.pause) {
            if (this.callee.getPlaying()) {
                this.callee.getPlaying()!.pause(this.callee.getToken());
            }
            return super.executeAction(state);
        } else if (this.type === SoundActionTypes.resume) {
            if (this.callee.getPlaying()) {
                this.callee.getPlaying()!.play(this.callee.getToken());
            }
            return super.executeAction(state);
        }

        throw super.unknownType();
    }
}