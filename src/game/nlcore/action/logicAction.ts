import type {Character} from "@core/elements/character";
import type {Scene} from "@core/elements/scene";
import type {Story} from "@core/elements/story";
import type {Image} from "@core/elements/image";
import type {Condition} from "@core/elements/condition";
import type {Script} from "@core/elements/script";
import type {Menu} from "@core/elements/menu";
import {Values} from "@lib/util/data";
import {TypedAction} from "@core/action/actions";
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
    StoryActionTypes,
    TextActionContentType
} from "@core/action/actionTypes";
import {CharacterAction} from "@core/action/actions/characterAction";
import {SceneAction} from "@core/action/actions/sceneAction";
import {StoryAction} from "@core/action/actions/storyAction";
import {ImageAction} from "@core/action/actions/imageAction";
import {ConditionAction} from "@core/action/actions/conditionAction";
import {ScriptAction} from "@core/action/actions/scriptAction";
import {MenuAction} from "@core/action/actions/menuAction";
import {SoundAction} from "@core/action/actions/soundAction";
import {ControlAction} from "@core/action/actions/controlAction";
import {Text} from "@core/elements/text";
import {TextAction} from "@core/action/actions/textAction";

export namespace LogicAction {
    export type Displayable = Text | Image;
    export type GameElement = Character | Scene | Story | Image | Condition | Script | Menu | Sound | Control | Text;
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
            | ControlAction
            | TextAction);
    export type ActionTypes =
        Values<typeof CharacterActionTypes>
        | Values<typeof ConditionActionTypes>
        | Values<typeof ImageActionTypes>
        | Values<typeof SceneActionTypes>
        | Values<typeof ScriptActionTypes>
        | Values<typeof StoryActionTypes>
        | Values<typeof MenuActionTypes>
        | Values<typeof SoundAction.ActionTypes>
        | Values<typeof ControlAction.ActionTypes>
        | Values<typeof TextAction.ActionTypes>;
    export type ActionContents =
        CharacterActionContentType
        & ConditionActionContentType
        & ImageActionContentType
        & SceneActionContentType
        & ScriptActionContentType
        & StoryActionContentType
        & MenuActionContentType
        & SoundActionContentType
        & ControlActionContentType
        & TextActionContentType;
}