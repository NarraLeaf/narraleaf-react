import {LogicAction} from "@core/action/logicAction";
import type {Story} from "@core/elements/story";
import type {ConditionData} from "@core/elements/condition";
import {CommonDisplayableConfig, ImageColor, ImageSrc} from "@core/types";
import {Transform} from "@core/elements/transform/transform";
import type {Scene} from "@core/elements/scene";
import type {MenuData} from "@core/elements/menu";
import {Awaitable, FlexibleTuple, SelectElementFromEach} from "@lib/util/data";
import {IImageTransition, ITransition} from "@core/elements/transition/type";
import type {Sound} from "@core/elements/sound";
import type {Script} from "@core/elements/script";
import {Sentence} from "@core/elements/character/sentence";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {Image, TagGroupDefinition} from "@core/elements/displayable/image";

export const DisplayableActionTypes = {
    action: "displayable:action",
    layerMoveUp: "displayable:layerMoveUp",
    layerMoveDown: "displayable:layerMoveDown",
    layerMoveTop: "displayable:layerMoveTop",
    layerMoveBottom: "displayable:layerMoveBottom",
    applyTransform: "displayable:applyTransform",
    applyTransition: "displayable:applyTransition",
} as const;
export type DisplayableActionContentType = {
    [K in typeof DisplayableActionTypes[keyof typeof DisplayableActionTypes]]:
    K extends "displayable:layerMoveUp" ? [void] :
        K extends "displayable:layerMoveDown" ? [void] :
            K extends "displayable:layerMoveTop" ? [void] :
                K extends "displayable:layerMoveBottom" ? [void] :
                    any;
}
/* Character */
export const CharacterActionTypes = {
    say: "character:say",
    action: "character:action",
    setName: "character:setName",
} as const;
export type CharacterActionContentType = {
    [K in typeof CharacterActionTypes[keyof typeof CharacterActionTypes]]:
    K extends "character:say" ? Sentence :
        K extends "character:action" ? any :
            K extends "character:setName" ? [string] :
                any;
}
/* Scene */
export const SceneActionTypes = {
    action: "scene:action",
    setBackground: "scene:setBackground",
    sleep: "scene:sleep",
    applyTransition: "scene:applyTransition",
    init: "scene:init",
    exit: "scene:exit",
    jumpTo: "scene:jumpTo",
    setBackgroundMusic: "scene:setBackgroundMusic",
    preUnmount: "scene:preUnmount",
    applyTransform: "scene:applyTransform",
    transitionToScene: "scene:transitionToScene",
} as const;
export type SceneActionContentType = {
    [K in typeof SceneActionTypes[keyof typeof SceneActionTypes]]:
    K extends typeof SceneActionTypes["action"] ? Scene :
        K extends typeof SceneActionTypes["sleep"] ? number | Promise<any> | Awaitable<any, any> :
            K extends typeof SceneActionTypes["setBackground"] ? [ImageSrc | ImageColor] :
                K extends typeof SceneActionTypes["applyTransition"] ? [ITransition] :
                    K extends typeof SceneActionTypes["init"] ? [Scene | string] :
                        K extends typeof SceneActionTypes["exit"] ? [] :
                            K extends typeof SceneActionTypes["jumpTo"] ? [Scene | string] :
                                K extends typeof SceneActionTypes["setBackgroundMusic"] ? [Sound | null, number?] :
                                    K extends typeof SceneActionTypes["preUnmount"] ? [] :
                                        K extends typeof SceneActionTypes["applyTransform"] ? [Transform] :
                                            K extends typeof SceneActionTypes["transitionToScene"] ? [IImageTransition, Scene | string | undefined, ImageSrc | ImageColor | undefined] :
                                                any;
}
/* Story */
export const StoryActionTypes = {
    action: "story:action",
} as const;
export type StoryActionContentType = {
    [K in typeof StoryActionTypes[keyof typeof StoryActionTypes]]:
    K extends "story:action" ? Story :
        any;
}
/* Image */
export const ImageActionTypes = {
    ...DisplayableActionTypes,
    action: "image:action",
    setSrc: "image:setSrc",
    setPosition: "image:setPosition",
    show: "image:show",
    hide: "image:hide",
    applyTransform: "image:applyTransform",
    init: "image:init",
    applyTransition: "image:applyTransition",
    flush: "image:flush",
    initWearable: "image:initWearable",
    setAppearance: "image:setAppearance",
} as const;
export type ImageActionContentType = {
    [K in typeof ImageActionTypes[keyof typeof ImageActionTypes]]:
    K extends "image:setSrc" ? [string] :
        K extends "image:setPosition" ? [CommonDisplayableConfig["position"], Transform<TransformDefinitions.ImageTransformProps>] :
            K extends "image:show" ? [void, Transform<TransformDefinitions.ImageTransformProps>] :
                K extends "image:hide" ? [void, Transform<TransformDefinitions.ImageTransformProps>] :
                    K extends "image:applyTransform" ? [void, Transform<TransformDefinitions.ImageTransformProps>, string] :
                        K extends "image:init" ? [Scene?] :
                            K extends "image:applyTransition" ? [ITransition] :
                                K extends "image:flush" ? [] :
                                    K extends "image:initWearable" ? [Image] :
                                        K extends "image:setAppearance" ? [FlexibleTuple<SelectElementFromEach<TagGroupDefinition>> | string[], IImageTransition | undefined] :
                                            any;
} & DisplayableActionContentType;
/* Condition */
export const ConditionActionTypes = {
    action: "condition:action",
} as const;
export type ConditionActionContentType = {
    [K in typeof ConditionActionTypes[keyof typeof ConditionActionTypes]]:
    K extends "condition:action" ? ConditionData :
        any;
}
/* Script */
export const ScriptActionTypes = {
    action: "script:action",
} as const;
export type ScriptActionContentType = {
    [K in typeof ScriptActionTypes[keyof typeof ScriptActionTypes]]:
    K extends "script:action" ? Script :
        any;
}
/* Menu */
export const MenuActionTypes = {
    action: "menu:action",
} as const;
export type MenuActionContentType = {
    [K in typeof MenuActionTypes[keyof typeof MenuActionTypes]]:
    K extends "menu:action" ? MenuData :
        any;
}
export const SoundActionTypes = {
    action: "sound:action",
    play: "sound:play",
    stop: "sound:stop",
    fade: "sound:fade",
    setVolume: "sound:setVolume",
    setRate: "sound:setRate",
    pause: "sound:pause",
    resume: "sound:resume",
} as const;
export type SoundActionContentType = {
    [K in typeof SoundActionTypes[keyof typeof SoundActionTypes]]:
    K extends "sound:play" ? [void] :
        K extends "sound:stop" ? [void] :
            K extends "sound:fade" ? [{
                    start?: number;
                    end: number;
                    duration: number;
                }] :
                K extends "sound:setVolume" ? [number] :
                    K extends "sound:setRate" ? [number] :
                        K extends "sound:pause" ? [void] :
                            K extends "sound:resume" ? [void] :
                                any;
}
export const ControlActionTypes = {
    action: "control:action",
    do: "control:do",
    doAsync: "control:doAsync",
    any: "control:any",
    all: "control:all",
    allAsync: "control:allAsync",
    repeat: "control:repeat",
    sleep: "control:sleep",
} as const;
export type ControlActionContentType = {
    [K in typeof ControlActionTypes[keyof typeof ControlActionTypes]]:
    K extends "control:do" ? [LogicAction.Actions[]] :
        K extends "control:doAsync" ? [LogicAction.Actions[]] :
            K extends "control:any" ? [LogicAction.Actions[]] :
                K extends "control:all" ? [LogicAction.Actions[]] :
                    K extends "control:parallel" ? [LogicAction.Actions[]] :
                        K extends "control:allAsync" ? [LogicAction.Actions[]] :
                            K extends "control:repeat" ? [LogicAction.Actions[], number] :
                                K extends "control:sleep" ? [LogicAction.Actions[], number | Awaitable<any> | Promise<any>] :
                                    any;
}
export const TextActionTypes = {
    action: "text:action",
    setText: "text:setText",
    show: "text:show",
    hide: "text:hide",
    applyTransform: "text:applyTransform",
    init: "text:init",
    applyTransition: "text:applyTransition",
    setFontSize: "text:setFontSize",
} as const;
export type TextActionContentType = {
    [K in typeof TextActionTypes[keyof typeof TextActionTypes]]:
    K extends "text:setText" ? [string] :
        K extends "text:show" ? [Transform<TransformDefinitions.TextTransformProps>] :
            K extends "text:hide" ? [Transform<TransformDefinitions.TextTransformProps>] :
                K extends "text:applyTransform" ? [Transform<TransformDefinitions.TextTransformProps>] :
                    K extends "text:init" ? [Scene?] :
                        K extends "text:applyTransition" ? [ITransition] :
                            K extends "text:setFontSize" ? [number] :
                                any;
}
/* Persistent */
export const PersistentActionTypes = {
    action: "persistent:action",
    set: "persistent:set",
} as const;
export type PersistentActionContentType = {
    [K in typeof PersistentActionTypes[keyof typeof PersistentActionTypes]]:
    K extends "persistent:action" ? any :
        K extends "persistent:set" ? [string, unknown | ((value: unknown) => unknown)] :
            any;
}
