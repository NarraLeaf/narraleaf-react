import type {Character} from "@core/elements/text";
import type {Scene} from "@core/elements/scene";
import type {Story} from "@core/elements/story";
import type {Image} from "@core/elements/image";
import type {Condition} from "@core/elements/condition";
import type {Script} from "@core/elements/script";
import type {Menu} from "@core/elements/menu";
import {Values} from "@lib/util/data";
import {
    CharacterAction,
    ConditionAction,
    ControlAction,
    ImageAction,
    MenuAction,
    SceneAction,
    ScriptAction,
    SoundAction,
    StoryAction,
    TypedAction
} from "@core/action/actions";
import {Sound} from "@core/elements/sound";
import {Control} from "@core/elements/control";
import {
    CharacterActionContentType,
    CharacterActionTypes,
    ConditionActionContentType,
    ConditionActionTypes,
    ControlActionContentType,
    ImageActionContentType,
    ImageActionTypes,
    MenuActionContentType,
    MenuActionTypes,
    SceneActionContentType,
    SceneActionTypes,
    ScriptActionContentType,
    ScriptActionTypes,
    SoundActionContentType,
    StoryActionContentType,
    StoryActionTypes
} from "@core/action/actionTypes";

export namespace LogicAction {
    export type GameElement = Character | Scene | Story | Image | Condition | Script | Menu | Sound | Control;
    export type Actions =
        (TypedAction
            | CharacterAction
            | ConditionAction
            | ImageAction
            | SceneAction
            | ScriptAction
            | StoryAction
            | MenuAction
            | SoundAction
            | ControlAction);
    export type ActionTypes =
        Values<typeof CharacterActionTypes>
        | Values<typeof ConditionActionTypes>
        | Values<typeof ImageActionTypes>
        | Values<typeof SceneActionTypes>
        | Values<typeof ScriptActionTypes>
        | Values<typeof StoryActionTypes>
        | Values<typeof MenuActionTypes>
        | Values<typeof SoundAction.ActionTypes>
        | Values<typeof ControlAction.ActionTypes>;
    export type ActionContents =
        CharacterActionContentType
        & ConditionActionContentType
        & ImageActionContentType
        & SceneActionContentType
        & ScriptActionContentType
        & StoryActionContentType
        & MenuActionContentType
        & SoundActionContentType
        & ControlActionContentType;
}