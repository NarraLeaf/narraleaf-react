import {Transition} from "@core/elements/transition/transition";
import {ImgElementProp, TransitionAnimationType} from "@core/elements/transition/type";
import {Color, ImageSrc} from "@core/types";
import {RuntimeScriptError, Utils} from "@core/common/Utils";
import {deepMerge} from "@lib/util/data";
import {Image} from "@core/elements/displayable/image";


export abstract class ImageTransition<T extends TransitionAnimationType[] = never[]> extends Transition<HTMLImageElement, T> {
    /**@package */
    private _src: Color | ImageSrc | undefined;

    /**@package */
    _setSrc(src: Color | ImageSrc): this {
        this._src = src;
        return this;
    }

    /**
     * Merge
     * @param props
     */
    public withSrc(props: ImgElementProp): ImgElementProp {
        if (Utils.isColor(this._src)) {
            return deepMerge(props, {
                src: Image.DefaultImagePlaceholder,
                style: {
                    backgroundColor: Utils.isRGBAColor(this._src) ? Utils.RGBAColorToHex(this._src) : this._src,
                    width: "100%", // @unsafe: may not work as expected
                    height: "100%",
                }
            } satisfies ImgElementProp);
        } else if (Utils.isImageSrc(this._src)) {
            return deepMerge(props, {
                src: Utils.srcToURL(this._src),
            } satisfies ImgElementProp);
        }

        throw new RuntimeScriptError("Image transition src cannot be identified, using: " + this._src);
    }
}
