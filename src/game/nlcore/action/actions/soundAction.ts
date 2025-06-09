import { TypedAction } from "@core/action/actions";
import { SoundActionContentType, SoundActionTypes } from "@core/action/actionTypes";
import { ContentNode } from "@core/action/tree/actionTree";
import type { Sound, SoundDataRaw } from "@core/elements/sound";
import { Awaitable } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { ActionHistoryPushOptions } from "@core/action/actionHistory";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

export class SoundAction<T extends typeof SoundActionTypes[keyof typeof SoundActionTypes] = typeof SoundActionTypes[keyof typeof SoundActionTypes]>
    extends TypedAction<SoundActionContentType, T, Sound> {
    static ActionTypes = SoundActionTypes;

    public executeAction(state: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        const historyProps: ActionHistoryPushOptions = {
            action: this,
            stackModel: injection.stackModel
        };
        if (this.type === SoundActionTypes.play) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:play"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.play(this.callee, options), {
                type: this.type,
                node: this.contentNode?.getChild()
            });

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(historyProps, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.stop) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:stop"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.stop(this.callee, options.duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            });

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(historyProps, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.setVolume) {
            const [volume, duration] = (this.contentNode as ContentNode<SoundActionContentType["sound:setVolume"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.setVolume(this.callee, volume, duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            });

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(historyProps, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.setRate) {
            const [rate] = (this.contentNode as ContentNode<SoundActionContentType["sound:setRate"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.setRate(this.callee, rate), {
                type: this.type,
                node: this.contentNode?.getChild()
            });

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(historyProps, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.pause) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:pause"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.pause(this.callee, options.duration), {
                type: this.type,
                node: this.contentNode?.getChild()
            });

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(historyProps, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        } else if (this.type === SoundActionTypes.resume) {
            const [options] = (this.contentNode as ContentNode<SoundActionContentType["sound:resume"]>).getContent();
            const originalState = this.callee.toData();

            const awaitable = Awaitable.forward(state.audioManager.resume(this.callee, options.duration), {
                type: this.type ,
                node: this.contentNode?.getChild()
            });

            state.timelines.attachTimeline(awaitable);
            state.actionHistory.push<[SoundDataRaw | null]>(historyProps, (prevState) => {
                if (prevState) this.callee.fromData(prevState);
            }, [originalState]);

            return awaitable;
        }

        throw super.unknownTypeError();
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("SoundAction");
    }
}