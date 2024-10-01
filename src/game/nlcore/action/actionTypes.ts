import {LogicAction} from "@core/action/logicAction";
import type {Story} from "@core/elements/story";
import type {ConditionData} from "@core/elements/condition";
import {Background, CommonImage} from "@core/types";
import {Transform} from "@core/elements/transform/transform";
import type {Scene} from "@core/elements/scene";
import type {Sentence} from "@core/elements/text";
import type {MenuData} from "@core/elements/menu";
import {Awaitable} from "@lib/util/data";
import {ITransition} from "@core/elements/transition/type";
import type {Sound} from "@core/elements/sound";
import type {Script} from "@core/elements/script";

/* Character */
export const CharacterActionTypes = {
    say: "character:say",
    action: "character:action",
} as const;
export type CharacterActionContentType = {
    [K in typeof CharacterActionTypes[keyof typeof CharacterActionTypes]]:
    K extends "character:say" ? Sentence :
        K extends "character:action" ? any :
            any;
}
/* Scene */
export const SceneActionTypes = {
    action: "scene:action",
    setBackground: "scene:setBackground",
    sleep: "scene:sleep",
    setTransition: "scene:setTransition",
    applyTransition: "scene:applyTransition",
    init: "scene:init",
    exit: "scene:exit",
    jumpTo: "scene:jumpTo",
    setBackgroundMusic: "scene:setBackgroundMusic",
    preUnmount: "scene:preUnmount",
    applyTransform: "scene:applyTransform",
} as const;
export type SceneActionContentType = {
    [K in typeof SceneActionTypes[keyof typeof SceneActionTypes]]:
    K extends typeof SceneActionTypes["action"] ? Scene :
        K extends typeof SceneActionTypes["sleep"] ? number | Promise<any> | Awaitable<any, any> :
            K extends typeof SceneActionTypes["setBackground"] ? [Background["background"]] :
                K extends typeof SceneActionTypes["setTransition"] ? [ITransition | null] :
                    K extends typeof SceneActionTypes["applyTransition"] ? [ITransition] :
                        K extends typeof SceneActionTypes["init"] ? [] :
                            K extends typeof SceneActionTypes["exit"] ? [] :
                                K extends typeof SceneActionTypes["jumpTo"] ? [Scene] :
                                    K extends typeof SceneActionTypes["setBackgroundMusic"] ? [Sound | null, number?] :
                                        K extends typeof SceneActionTypes["preUnmount"] ? [] :
                                            K extends typeof SceneActionTypes["applyTransform"] ? [Transform] :
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
    action: "image:action",
    setSrc: "image:setSrc",
    setPosition: "image:setPosition",
    show: "image:show",
    hide: "image:hide",
    applyTransform: "image:applyTransform",
    init: "image:init",
    dispose: "image:dispose",
    setTransition: "image:setTransition",
    applyTransition: "image:applyTransition",
} as const;
export type ImageActionContentType = {
    [K in typeof ImageActionTypes[keyof typeof ImageActionTypes]]:
    K extends "image:setSrc" ? [string] :
        K extends "image:setPosition" ? [CommonImage["position"], Transform] :
            K extends "image:show" ? [void, Transform] :
                K extends "image:hide" ? [void, Transform] :
                    K extends "image:applyTransform" ? [void, Transform, string] :
                        K extends "image:init" ? [Scene?] :
                            K extends "image:dispose" ? [] :
                                K extends "image:setTransition" ? [ITransition | null] :
                                    K extends "image:applyTransition" ? [ITransition] :
                                        any;
}
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
                                any;
}