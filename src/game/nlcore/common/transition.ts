import {IImageTransition, ITextTransition, ITransition} from "@core/elements/transition/type";
import {BaseImageTransition, BaseTextTransition, BaseTransition} from "@core/elements/transition/baseTransitions";
import {Fade} from "@core/elements/transition/imageTransitions/fade";
import {FadeIn} from "@core/elements/transition/imageTransitions/fadeIn";
import {Dissolve as Legacy_Dissolve} from "@core/elements/transition/imageTransitions/dissolve";
import {Dissolve} from "@core/elements/transition/transitions/image/dissolve";
import {Transition} from "@core/elements/transition/transition";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";

export {
    Fade,
    FadeIn,
    Legacy_Dissolve,
    BaseTransition,
    BaseImageTransition,
    BaseTextTransition,
    Dissolve,
    Transition,
    ImageTransition,
    TextTransition,
};
export type {
    ITransition,
    IImageTransition,
    ITextTransition,
};