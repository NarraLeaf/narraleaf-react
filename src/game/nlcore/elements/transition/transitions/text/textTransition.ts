import {TransitionAnimationType} from "@core/elements/transition/type";
import {Transition} from "@core/elements/transition/transition";
import {Text, TextState} from "@core/elements/displayable/text";
import {RuntimeGameError} from "@core/common/Utils";

export abstract class TextTransition<T extends TransitionAnimationType[] = any> extends Transition<HTMLSpanElement, T> {
    /**@package */
    private _element: Text | undefined;

    /**@package */
    _setElement(element: Text): this {
        this._element = element;
        return this;
    }

    public getTextState(): TextState {
        if (this._element === undefined) {
            throw new RuntimeGameError("Trying to access text state, but element is not set" +
                "\nThis should not happen, please report this issue to the developers");
        }
        return this._element.state;
    }
}

