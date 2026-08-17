import {Dissolve} from "@core/elements/transition/transitions/image/dissolve";
import {FadeIn} from "@core/elements/transition/transitions/image/fadeIn";
import {Transition} from "@core/elements/transition/transition";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";
import {BlurDissolve} from "@core/elements/transition/transitions/image/blurDissolve";
import {Push} from "@core/elements/transition/transitions/image/push";
import {Darkness} from "@core/elements/transition/transitions/image/darkness";
import {Exposure} from "@core/elements/transition/transitions/image/exposure";
import {ThroughColor} from "@core/elements/transition/transitions/image/throughColor";
import {Reveal} from "@core/elements/transition/transitions/image/reveal";
import {Mask} from "@core/elements/transition/transitions/image/mask";

export {
    Transition,
    ImageTransition,
    TextTransition,
    Dissolve,
    FadeIn,
    BlurDissolve,
    Push,
    Darkness,
    Exposure,
    ThroughColor,
    Reveal,
    Mask,
};

export type {DissolveOptions} from "@core/elements/transition/transitions/image/dissolve";
export type {FadeInOptions} from "@core/elements/transition/transitions/image/fadeIn";
export type {BlurDissolveOptions} from "@core/elements/transition/transitions/image/blurDissolve";
export type {PushOptions} from "@core/elements/transition/transitions/image/push";
export type {DarknessOptions} from "@core/elements/transition/transitions/image/darkness";
export type {ExposureOptions} from "@core/elements/transition/transitions/image/exposure";
export type {
    ThroughColorOptions,
    ThroughColorUncover,
} from "@core/elements/transition/transitions/image/throughColor";
export type {RevealOptions} from "@core/elements/transition/transitions/image/reveal";
export type {
    MaskPattern,
    WipePatternOptions,
    BarnDoorPatternOptions,
    IrisPatternOptions,
    ClockPatternOptions,
    FanPatternOptions,
    BlindsPatternOptions,
    DotsPatternOptions,
} from "@core/elements/transition/transitions/image/mask";
export type {BlindsOrientation} from "@core/elements/transition/transitions/image/transitionMaskUtils";
