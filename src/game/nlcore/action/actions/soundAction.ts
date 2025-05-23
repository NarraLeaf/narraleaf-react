import { TypedAction } from "@core/action/actions";
import { SoundActionContentType, SoundActionTypes } from "@core/action/actionTypes";
import { ContentNode } from "@core/action/tree/actionTree";
import type { Sound, SoundDataRaw } from "@core/elements/sound";
import { Awaitable } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { ExecutedActionResult } from "../action";

export class SoundAction<T extends typeof SoundActionTypes[keyof typeof SoundActionTypes] = typeof SoundActionTypes[keyof typeof SoundActionTypes]>
    extends TypedAction<SoundActionContentType, T, Sound> {
    static ActionTypes = SoundActionTypes;

    public executeAction(state: GameState): ExecutedActionResult {
        if (this.type === SoundActionTypes.play) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:play"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.play(this.callee, options), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(this, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.stop) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:stop"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.stop(this.callee, options.duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(this, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.setVolume) {
            const [volume, duration] = (this.contentNode as ContentNode<SoundActionContentType["sound:setVolume"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.setVolume(this.callee, volume, duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(this, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.setRate) {
            const [rate] = (this.contentNode as ContentNode<SoundActionContentType["sound:setRate"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.setRate(this.callee, rate), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(this, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.pause) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:pause"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.pause(this.callee, options.duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(this, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.resume) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:resume"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.resume(this.callee, options.duration), {
                type: this.type ,
                node: this.contentNode?.getChild()
            }).then(() => state.stage.next());

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(this, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        }

        throw super.unknownTypeError();
    }
}