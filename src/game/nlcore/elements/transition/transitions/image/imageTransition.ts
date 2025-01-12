import {Transition} from "@core/elements/transition/transition";
import {
    AnimationDataTypeArray,
    ImgElementProp,
    TransitionAnimationType,
    TransitionResolver
} from "@core/elements/transition/type";
import {Color, ImageSrc} from "@core/types";
import {RuntimeScriptError, Utils} from "@core/common/Utils";
import {deepMerge} from "@lib/util/data";
import {Image} from "@core/elements/displayable/image";

export abstract class ImageTransition<T extends TransitionAnimationType[] = any> extends Transition<HTMLImageElement, T> {
    /**@package */
    private _prevSrc: Color | ImageSrc | undefined;
    /**@package */
    private _targetSrc: Color | ImageSrc | undefined;

    /**@package */
    _setPrevSrc(src: Color | ImageSrc | undefined): this {
        this._prevSrc = src;
        return this;
    }

    /**@package */
    _setTargetSrc(src: Color | ImageSrc | undefined): this {
        this._targetSrc = src;
        return this;
    }

    override asPrev<T extends TransitionAnimationType[] = any>(resolver: (...args: AnimationDataTypeArray<T>) => ImgElementProp): TransitionResolver<HTMLImageElement, T> {
        return super.asPrev((...args: AnimationDataTypeArray<T>) =>
            deepMerge(resolver(...args), this._srcToProps(this._prevSrc)));
    }

    override asTarget<T extends TransitionAnimationType[] = any>(resolver: (...args: AnimationDataTypeArray<T>) => ImgElementProp): TransitionResolver<HTMLImageElement, T> {
        return super.asTarget((...args: AnimationDataTypeArray<T>) =>
            deepMerge(resolver(...args), this._srcToProps(this._targetSrc)));
    }

    /**@package */
    private _srcToProps(src: Color | ImageSrc | undefined): ImgElementProp {
        if (Utils.isColor(src)) {
            return {
                src: Image.DefaultImagePlaceholder,
                style: {
                    backgroundColor: Utils.isRGBAColor(src) ? Utils.RGBAColorToHex(src) : src,
                    width: "100%", // @unsafe: may not work as expected
                    height: "100%",
                }
            } satisfies ImgElementProp;
        } else if (Utils.isImageSrc(src)) {
            return {
                src: Utils.srcToURL(src),
            } satisfies ImgElementProp;
        }

        throw new RuntimeScriptError("Image transition src cannot be identified, using: " + src);
    }
}
