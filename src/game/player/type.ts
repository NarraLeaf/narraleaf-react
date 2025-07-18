import {Choice} from "@core/elements/menu";
import {Image} from "@core/elements/displayable/image";
import {EventDispatcher} from "@lib/util/data";
import {ImageEvents} from "@player/elements/image/Image";
import {Transform} from "@core/elements/transform/transform";
import {Transition} from "@core/elements/transition/transition";
import {Layer} from "@core/elements/layer";
import {Text} from "@core/elements/displayable/text";
import {Displayable} from "@core/elements/displayable/displayable";
import {Scene} from "@core/elements/scene";
import {Sound} from "@core/elements/sound";
import {Video} from "@core/elements/video";
import { Timeline } from "./Tasks";

export * from "@player/elements/type";
export type Chosen = Choice & {
    evaluated: string;
};

export enum ExposedStateType {
    image = "narraleaf:image",
    text = "narraleaf:text",
    layer = "narraleaf:layer",
    scene = "narraleaf:scene",
    video = "narraleaf:video",
}

export type ExposedState = {
    [ExposedStateType.image]: {
        createWearable: (wearable: Image) => void;
        disposeWearable: (wearable: Image) => void;
        events: EventDispatcher<ImageEvents>;
        initDisplayable: (onResolve: () => void) => Timeline;
        applyTransform: (transform: Transform, onResolve: () => void) => Timeline;
        applyTransition: (transition: Transition<any>, onResolve: () => void) => Timeline;
        updateStyleSync: () => void;
    };
    [ExposedStateType.text]: {
        initDisplayable: (onResolve: () => void) => Timeline;
        applyTransform: (transform: Transform, onResolve: () => void) => Timeline;
        applyTransition: (transition: Transition<any>, onResolve: () => void) => Timeline;
        updateStyleSync: () => void;
        flush: () => void;
    };
    [ExposedStateType.layer]: {
        initDisplayable: (onResolve: () => void) => Timeline;
        applyTransform: (transform: Transform, onResolve: () => void) => Timeline;
        applyTransition: (transition: Transition<any>, onResolve: () => void) => Timeline;
        updateStyleSync: () => void;
    };
    [ExposedStateType.scene]: {
        setBackgroundMusic: (music: Sound | null, fade: number) => Promise<void>;
    };
    [ExposedStateType.video]: {
        show: () => void;
        hide: () => void;
        play: () => Promise<void>;
        pause: () => void;
        resume: () => Promise<void>;
        stop: () => void;
        seek: (time: number) => void;
    };
};

export type ExposedKeys = {
    [ExposedStateType.image]: Image | Displayable<any, any>;
    [ExposedStateType.text]: Text | Displayable<any, any>;
    [ExposedStateType.layer]: Layer | Displayable<any, any>;
    [ExposedStateType.scene]: Scene;
    [ExposedStateType.video]: Video;
};

export type { INotificationsProps } from "./elements/notification/type";