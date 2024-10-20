import {IImageTransition, ITextTransition, ITransition} from "@core/elements/transition/type";
import {BaseImageTransition, BaseTextTransition, BaseTransition} from "@core/elements/transition/baseTransitions";
import {Fade} from "@core/elements/transition/imageTransitions/fade";
import {FadeIn} from "@core/elements/transition/imageTransitions/fadeIn";
import {Dissolve} from "@core/elements/transition/imageTransitions/dissolve";

export {
    Fade,
    FadeIn,
    Dissolve,
    BaseTransition,
    BaseImageTransition,
    BaseTextTransition,
};
export type {
    ITransition,
    IImageTransition,
    ITextTransition,
};