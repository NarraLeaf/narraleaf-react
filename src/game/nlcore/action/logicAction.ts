import type {Character} from "@core/elements/character";
import type {Scene} from "@core/elements/scene";
import type {Story} from "@core/elements/story";
import type {Image} from "@core/elements/displayable/image";
import type {Condition} from "@core/elements/condition";
import type {Script} from "@core/elements/script";
import type {Menu} from "@core/elements/menu";
import {StringKeyOf, Values} from "@lib/util/data";
import {TypedAction} from "@core/action/actions";
import {Sound} from "@core/elements/sound";
import {Control} from "@core/elements/control";
import {
    CharacterActionContentType,
    CharacterActionTypes,
    ConditionActionContentType,
    ConditionActionTypes,
    ControlActionContentType,
    DisplayableActionContentType,
    DisplayableActionTypes,
    ImageActionContentType,
    ImageActionTypes, LayerActionContentType, LayerActionTypes,
    MenuActionContentType,
    MenuActionTypes, PersistentActionContentType, PersistentActionTypes,
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
import {Text} from "@core/elements/displayable/text";
import {TextAction} from "@core/action/actions/textAction";
import {Displayable as AbstractDisplayable} from "@core/elements/displayable/displayable";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {Persistent} from "@core/elements/persistent";
import {PersistentAction} from "@core/action/actions/persistentAction";
import {ServiceSkeleton} from "@core/elements/service";
import {ServiceAction, ServiceActionContentType} from "@core/action/serviceAction";
import {Layer} from "@core/elements/layer";
import {LayerAction} from "@core/action/actions/layerAction";
import {ExposedStateType} from "@player/type";

export namespace LogicAction {
    export type DisplayableElements = Text | Image | Layer | AbstractDisplayable<any, any>;
    export type DisplayableExposed = ExposedStateType.image | ExposedStateType.layer | ExposedStateType.text;
    export type GameElement =
        Character
        | Scene
        | Story
        | Image
        | Condition
        | Script
        | Menu
        | Sound
        | Control
        | Text
        | AbstractDisplayable<any, any>
        | Persistent<any>
        | ServiceSkeleton;
    export type Actions =
        TypedAction
        | CharacterAction
        | ConditionAction
        | ImageAction
        | SceneAction
        | ScriptAction
        | StoryAction
        | MenuAction
        | SoundAction
        | ControlAction
        | TextAction
        | DisplayableAction
        | PersistentAction
        | ServiceAction
        | LayerAction;
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
        | Values<typeof TextAction.ActionTypes>
        | Values<typeof DisplayableActionTypes>
        | Values<typeof PersistentActionTypes>
        | StringKeyOf<ServiceActionContentType>
        | Values<typeof LayerActionTypes>;
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
        & TextActionContentType
        & DisplayableActionContentType
        & PersistentActionContentType
        & ServiceActionContentType
        & LayerActionContentType;
}