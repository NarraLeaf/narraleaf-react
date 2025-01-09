import {Transition} from "@core/elements/transition/transition";
import {ImgElementProp, TransitionAnimationType} from "@core/elements/transition/type";
import {Color, ImageSrc} from "@core/types";
import {RuntimeScriptError, Utils} from "@core/common/Utils";
import {deepMerge} from "@lib/util/data";
import {Image} from "@core/elements/displayable/image";


export abstract class ImageTransition<T extends TransitionAnimationType[] = never[]> extends Transition<HTMLImageElement, T> {
    /**@package */
    private _currentSrc: Color | ImageSrc | undefined;
    /**@package */
    private _targetSrc: Color | ImageSrc | undefined;

    /**@package */
    _setCurrentSrc(src: Color | ImageSrc | undefined): void {
        this._currentSrc = src;
    }

    /**@package */
    _setTargetSrc(src: Color | ImageSrc | undefined): void {
        this._targetSrc = src;
    }

    /**
     * Merge image props with the current src
     */
    public withCurrentSrc(props: ImgElementProp): ImgElementProp {
        return deepMerge(props, this._srcToProps(this._currentSrc));
    }

    /**
     * Merge image props with target src
     */
    public withTargetSrc(props: ImgElementProp): ImgElementProp {
        return deepMerge(props, this._srcToProps(this._targetSrc));
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
