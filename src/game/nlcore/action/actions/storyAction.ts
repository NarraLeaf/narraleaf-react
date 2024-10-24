import {StoryActionContentType, StoryActionTypes} from "@core/action/actionTypes";
import type {Story} from "@core/elements/story";
import {TypedAction} from "@core/action/actions";

export class StoryAction<T extends typeof StoryActionTypes[keyof typeof StoryActionTypes] = typeof StoryActionTypes[keyof typeof StoryActionTypes]>
    extends TypedAction<StoryActionContentType, T, Story> {
    static ActionTypes = StoryActionTypes;
}