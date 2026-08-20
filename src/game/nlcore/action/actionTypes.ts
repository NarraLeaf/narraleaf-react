import type { LogicAction } from "@core/action/logicAction";
import type { Story } from "@core/elements/story";
import type { ConditionData, Lambda } from "@core/elements/condition";
import type { Color, ImageSrc } from "@core/types";
import type { Transform } from "@core/elements/transform/transform";
import type { Scene } from "@core/elements/scene";
import type { MenuData } from "@core/elements/menu";
import type { Awaitable, FlexibleTuple, SelectElementFromEach } from "@lib/util/data";
import type { Sound } from "@core/elements/sound";
import type { Script } from "@core/elements/script";
import type { Sentence } from "@core/elements/character/sentence";
import type { TransformDefinitions } from "@core/elements/transform/type";
import type { Image, TagGroupDefinition } from "@core/elements/displayable/image";
import type { FadeOptions } from "@core/elements/type";
import type { Transition } from "@core/elements/transition/transition";
import type { ImageTransition } from "@core/elements/transition/transitions/image/imageTransition";
import type { Layer } from "@core/elements/layer";
import type { VfxFadeOptions } from "@core/elements/vfx";
import type { PuppetCommandOptions } from "@core/elements/displayable/puppet";

export const DisplayableActionTypes = {
    action: "displayable:action",
    applyTransform: "displayable:applyTransform",
    applyTransition: "displayable:applyTransition",
    applyLoop: "displayable:applyLoop",
    stopLoop: "displayable:stopLoop",
    init: "displayable:init",
    bringToFront: "displayable:bringToFront",
} as const;
export type DisplayableActionContentType<TransitionType extends Transition = Transition> = {
    [K in typeof DisplayableActionTypes[keyof typeof DisplayableActionTypes]]:
    K extends "displayable:applyTransform" ? [Transform] :
    K extends "displayable:applyTransition" ? [TransitionType, ((transition: TransitionType) => TransitionType)?] :
    K extends "displayable:applyLoop" ? [Transform, TransformDefinitions.LoopOptions?] :
    K extends "displayable:stopLoop" ? [TransformDefinitions.LoopStopOptions?] :
    K extends "displayable:init" ? [scene: Scene | null, layer: Layer | null, isElement?: boolean] :
    K extends "displayable:bringToFront" ? [] :
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
    init: "scene:init",
    exit: "scene:exit",
    jumpTo: "scene:jumpTo",
    setBackgroundMusic: "scene:setBackgroundMusic",
    preUnmount: "scene:preUnmount",
    transitionToScene: "scene:transitionToScene",
    nvlBlock: "scene:nvlBlock",
    nvlShow: "scene:nvlShow",
    nvlHide: "scene:nvlHide",
    nvlEnd: "scene:nvlEnd",
} as const;
export type NvlBlockOptions = {
    showTransition?: Partial<TransformDefinitions.CommonTransformProps>;
    hideTransition?: Partial<TransformDefinitions.CommonTransformProps>;
};
export type SceneActionContentType = {
    [K in typeof SceneActionTypes[keyof typeof SceneActionTypes]]:
    K extends typeof SceneActionTypes["action"] ? Scene :
    K extends typeof SceneActionTypes["init"] ? [Scene] :
    K extends typeof SceneActionTypes["exit"] ? [] :
    K extends typeof SceneActionTypes["jumpTo"] ? [Scene] :
    K extends typeof SceneActionTypes["setBackgroundMusic"] ? [Sound | null, number?] :
    K extends typeof SceneActionTypes["preUnmount"] ? [] :
    K extends typeof SceneActionTypes["transitionToScene"] ? [Transition, Scene] :
    K extends typeof SceneActionTypes["nvlBlock"] ? [LogicAction.Actions[], NvlBlockOptions] :
    K extends typeof SceneActionTypes["nvlShow"] ? [Partial<TransformDefinitions.CommonTransformProps>?] :
    K extends typeof SceneActionTypes["nvlHide"] ? [Partial<TransformDefinitions.CommonTransformProps>?] :
    K extends typeof SceneActionTypes["nvlEnd"] ? [NvlBlockOptions?] :
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
    flush: "image:flush",
    initWearable: "image:initWearable",
    setAppearance: "image:setAppearance",
    setDarkness: "image:setDarkness",
} as const;
export type ImageActionContentType = {
    [K in typeof ImageActionTypes[keyof typeof ImageActionTypes]]:
    K extends "image:setSrc" ? [ImageSrc | Color] :
    K extends "image:flush" ? [] :
    K extends "image:initWearable" ? [Image] :
    K extends "image:setAppearance" ? [FlexibleTuple<SelectElementFromEach<TagGroupDefinition>> | string[], ImageTransition | undefined] :
    K extends "image:setDarkness" ? [darkness: number, duration?: number, easing?: TransformDefinitions.EasingDefinition] :
    any;
} & DisplayableActionContentType<ImageTransition>;
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
    setVolume: "sound:setVolume",
    setRate: "sound:setRate",
    pause: "sound:pause",
    resume: "sound:resume",
    mute: "sound:mute",
    seek: "sound:seek",
} as const;
export type SoundActionContentType = {
    [K in typeof SoundActionTypes[keyof typeof SoundActionTypes]]:
    K extends "sound:play" ? [FadeOptions] :
    K extends "sound:stop" ? [FadeOptions] :
    K extends "sound:setVolume" ? [volume: number, duration: number] :
    K extends "sound:setRate" ? [number] :
    K extends "sound:pause" ? [FadeOptions] :
    K extends "sound:resume" ? [FadeOptions] :
    K extends "sound:mute" ? [boolean] :
    K extends "sound:seek" ? [time: number] :
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
    while: "control:while",
    break: "control:break",
    sleep: "control:sleep",
    waitForClick: "control:waitForClick",
    label: "control:label",
    jump: "control:jump",
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
    K extends "control:while" ? [LogicAction.Actions[], Lambda<boolean>] :
    K extends "control:break" ? [] :
    K extends "control:sleep" ? [LogicAction.Actions[], number | Awaitable<any> | Promise<any>] :
    K extends "control:waitForClick" ? [] :
    K extends "control:label" ? [string] :
    K extends "control:jump" ? [string] :
    any;
}
export const TextActionTypes = {
    action: "text:action",
    setText: "text:setText",
    setFontSize: "text:setFontSize",
} as const;
export type TextActionContentType = {
    [K in typeof TextActionTypes[keyof typeof TextActionTypes]]:
    K extends "text:setText" ? [string] :
    K extends "text:show" ? [Transform<TransformDefinitions.TextTransformProps>] :
    K extends "text:hide" ? [Transform<TransformDefinitions.TextTransformProps>] :
    K extends "text:applyTransform" ? [Transform<TransformDefinitions.TextTransformProps>] :
    K extends "text:init" ? [Scene?] :
    K extends "text:setFontSize" ? [number] :
    any;
}
/* Persistent */
export const PersistentActionTypes = {
    action: "persistent:action",
    set: "persistent:set",
    assign: "persistent:assign",
} as const;
export type PersistentActionContentType = {
    [K in typeof PersistentActionTypes[keyof typeof PersistentActionTypes]]:
    K extends "persistent:action" ? any :
    K extends "persistent:set" ? [string, unknown | ((value: unknown) => unknown)] :
    K extends "persistent:assign" ? [Partial<unknown> | ((value: unknown) => Partial<unknown>)] :
    any;
}
/* Layer */
export const LayerActionTypes = {
    action: "layer:action",
    setZIndex: "layer:setZIndex",
} as const;
export type LayerActionContentType = {
    [K in typeof LayerActionTypes[keyof typeof LayerActionTypes]]:
    K extends "layer:action" ? any :
    K extends "layer:setZIndex" ? [number] :
    any;
}
/* Video */
export const VideoActionTypes = {
    action: "video:action",
    show: "video:show",
    hide: "video:hide",
    play: "video:play",
    pause: "video:pause",
    resume: "video:resume",
    stop: "video:stop",
    seek: "video:seek",
} as const;
export type VideoActionContentType = {
    [K in typeof VideoActionTypes[keyof typeof VideoActionTypes]]:
    K extends "video:action" ? any :
    K extends "video:show" | "video:hide" | "video:play" | "video:pause" | "video:stop" | "video:resume" ? [] :
    K extends "video:seek" ? [number] :
    any;
}
/* Vfx */
export const VfxActionTypes = {
    action: "vfx:action",
    preload: "vfx:preload",
    show: "vfx:show",
    hide: "vfx:hide",
    pause: "vfx:pause",
    resume: "vfx:resume",
    setRate: "vfx:setRate",
} as const;
export type VfxActionContentType = {
    [K in typeof VfxActionTypes[keyof typeof VfxActionTypes]]:
    K extends "vfx:action" ? any :
    K extends "vfx:show" | "vfx:hide" ? [VfxFadeOptions?] :
    K extends "vfx:preload" | "vfx:pause" | "vfx:resume" ? [] :
    K extends "vfx:setRate" ? [number] :
    any;
}
/* Puppet */
export const PuppetActionTypes = {
    action: "puppet:action",
    setMotion: "puppet:setMotion",
    setExpression: "puppet:setExpression",
    setSkin: "puppet:setSkin",
    setParam: "puppet:setParam",
    setSlot: "puppet:setSlot",
    command: "puppet:command",
} as const;
export type PuppetActionContentType = {
    [K in typeof PuppetActionTypes[keyof typeof PuppetActionTypes]]:
    K extends "puppet:action" ? any :
    K extends "puppet:setMotion" ? [motion: string | null] :
    K extends "puppet:setExpression" ? [expression: string | null] :
    K extends "puppet:setSkin" ? [skin: string | null] :
    K extends "puppet:setParam" ? [id: string, value: number] :
    K extends "puppet:setSlot" ? [id: string, value: string | null] :
    K extends "puppet:command" ? [name: string, payload: unknown, options: PuppetCommandOptions | undefined] :
    any;
}
