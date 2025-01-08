import React, {useEffect, useRef} from "react";
import {ImgElementProp} from "@core/elements/transition/type";
import {useRatio} from "@player/provider/ratio";
import {usePreloaded} from "@player/provider/preloaded";
import {Image} from "@core/elements/displayable/image";
import {useGame} from "@core/common/player";
import {Utils} from "@core/common/Utils";

/**@internal */
export default function AspectScaleImage(
    {
        props,
        onLoad,
        id,
        ref,
        onWidthChange,
        autoFit = false,
    }: Readonly<{
        props: Omit<ImgElementProp, "onLoad">;
        onLoad?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
        id?: string;
        ref?: React.RefObject<HTMLImageElement | null>;
        onWidthChange?: (width: number) => void;
        autoFit?: boolean;
    }>
) {
    const imgRef = useRef<HTMLImageElement>(null);
    const {ratio} = useRatio();
    const [width, setWidth] = React.useState<number>(0);
    const {cacheManager} = usePreloaded();
    const {game} = useGame();

    const LogTag = "AspectScaleImage";

    useEffect(() => {
        if (props.src && !Utils.isDataURI(props.src) && (!cacheManager.has(props.src) && !cacheManager.isPreloading(props.src))) {
            game.getLiveGame().getGameState()?.logger.warn(LogTag,
                `Image not preloaded: "${props.src}". `
                + "\nThis may be caused by complicated image action behavior that cannot be predicted. "
                + "\nTo fix this issue, you can manually register the image using scene.requestImagePreload(YourImageSrc). "
            );
        }
    }, [props, props.src, id]);

    useEffect(() => {
        updateWidth();

        return ratio.onUpdate(updateWidth);
    }, [props, id]);

    function updateWidth() {
        const currentRef = ref || imgRef;
        if (currentRef.current) {
            const autoFitFactor = autoFit ? (game.config.player.width / currentRef.current.naturalWidth) : 1;
            const newWidth = currentRef.current.naturalWidth * ratio.state.scale * autoFitFactor;
            setWidth(newWidth);
            if (onWidthChange) {
                onWidthChange(newWidth);
            }
        }
    }

    function handleOnLoad(event: React.SyntheticEvent<HTMLImageElement, Event>) {
        updateWidth();
        if (onLoad) {
            onLoad(event);
        }
    }

    const src: string = props.src ? (cacheManager.get(props.src) || props.src) : Image.DefaultImagePlaceholder;

    return (
        <img
            ref={ref || imgRef}
            {...props}
            onLoad={handleOnLoad}
            width={width}
            alt={props.alt}
            src={src}
        />
    );
}
