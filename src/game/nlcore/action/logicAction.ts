import type {Character} from "@core/elements/character";
import type {Scene} from "@core/elements/scene";
import type {Story} from "@core/elements/story";
import type {Image} from "@core/elements/displayable/image";
import type {Condition} from "@core/elements/condition";
import type {Script} from "@core/elements/script";
import type {Menu} from "@core/elements/menu";
import type {StringKeyOf, Values} from "@lib/util/data";
import type {TypedAction} from "@core/action/actions";
import type {Sound} from "@core/elements/sound";
import type {Control} from "@core/elements/control";
import {
    CharacterActionContentType,
    CharacterActionTypes,
    ConditionActionContentType,
    ConditionActionTypes,
    ControlActionContentType,
    ControlActionTypes,
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
    SoundActionContentType, SoundActionTypes,
    StoryActionContentType,
    StoryActionTypes,
    TextActionContentType, TextActionTypes, VideoActionContentType, VideoActionTypes
} from "@core/action/actionTypes";
import type {CharacterAction} from "@core/action/actions/characterAction";
import type {SceneAction} from "@core/action/actions/sceneAction";
import type {StoryAction} from "@core/action/actions/storyAction";
import type {ImageAction} from "@core/action/actions/imageAction";
import type {ConditionAction} from "@core/action/actions/conditionAction";
import type {ScriptAction} from "@core/action/actions/scriptAction";
import type {MenuAction} from "@core/action/actions/menuAction";
import type {SoundAction} from "@core/action/actions/soundAction";
import type {ControlAction} from "@core/action/actions/controlAction";
import type {Text} from "@core/elements/displayable/text";
import type {TextAction} from "@core/action/actions/textAction";
import type {Displayable as AbstractDisplayable} from "@core/elements/displayable/displayable";
import type {DisplayableAction} from "@core/action/actions/displayableAction";
import type {Persistent} from "@core/elements/persistent";
import type {PersistentAction} from "@core/action/actions/persistentAction";
import type {ServiceSkeleton} from "@core/elements/service";
import type {ServiceAction, ServiceActionContentType} from "@core/action/serviceAction";
import type {Layer} from "@core/elements/layer";
import type {LayerAction} from "@core/action/actions/layerAction";
import type {ExposedStateType} from "@player/type";
import type {Video} from "@core/elements/video";
import type {VideoAction} from "@core/action/actions/videoAction";

// Define the interface first
export interface LogicActionInterface {
    DisplayableElements: Text | Image | Layer | AbstractDisplayable<any, any>;
    DisplayableExposed: ExposedStateType.image | ExposedStateType.layer | ExposedStateType.text;
    GameElement: Character
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
        | ServiceSkeleton
        | Video;
    Actions: TypedAction
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
        | LayerAction
        | VideoAction;
    ActionTypes: Values<typeof CharacterActionTypes>
        | Values<typeof ConditionActionTypes>
        | Values<typeof ImageActionTypes>
        | Values<typeof SceneActionTypes>
        | Values<typeof ScriptActionTypes>
        | Values<typeof StoryActionTypes>
        | Values<typeof MenuActionTypes>
        | Values<typeof SoundActionTypes>
        | Values<typeof ControlActionTypes>
        | Values<typeof TextActionTypes>
        | Values<typeof DisplayableActionTypes>
        | Values<typeof PersistentActionTypes>
        | StringKeyOf<ServiceActionContentType>
        | Values<typeof LayerActionTypes>
        | Values<typeof VideoActionTypes>;
    ActionContents: CharacterActionContentType
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
        & LayerActionContentType
        & VideoActionContentType;
}

export const LogicAction = {
} as const;

// Define and export the namespace type
export namespace LogicAction {
    export type DisplayableElements = Text | Image | Layer | AbstractDisplayable<any, any>;
    export type DisplayableExposed = ExposedStateType.image | ExposedStateType.layer | ExposedStateType.text;
    export type GameElement = Character
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
        | ServiceSkeleton
        | Video;
    export type Actions = TypedAction
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
        | LayerAction
        | VideoAction;
    export type ActionTypes = Values<typeof CharacterActionTypes>
        | Values<typeof ConditionActionTypes>
        | Values<typeof ImageActionTypes>
        | Values<typeof SceneActionTypes>
        | Values<typeof ScriptActionTypes>
        | Values<typeof StoryActionTypes>
        | Values<typeof MenuActionTypes>
        | Values<typeof SoundActionTypes>
        | Values<typeof ControlActionTypes>
        | Values<typeof TextActionTypes>
        | Values<typeof DisplayableActionTypes>
        | Values<typeof PersistentActionTypes>
        | StringKeyOf<ServiceActionContentType>
        | Values<typeof LayerActionTypes>
        | Values<typeof VideoActionTypes>;
    export type ActionContents = CharacterActionContentType
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
        & LayerActionContentType
        & VideoActionContentType;
}

// Export the type
export type LogicAction = typeof LogicAction;
