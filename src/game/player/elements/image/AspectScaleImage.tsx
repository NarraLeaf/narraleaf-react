import React, {useEffect, useRef} from "react";
import {useRatio} from "@player/provider/ratio";
import {useGame} from "@core/common/player";

/**@internal */
export default function AspectScaleImage(
    {
        ref,
        onSizeChanged,
        onLoad,
        autoFit = false,
    }: Readonly<{
        ref?: React.RefObject<HTMLImageElement | null>;
        onSizeChanged?: (width: number, height: number) => void;
        onLoad?: () => void;
        autoFit?: boolean;
    }>
) {
    const imgRef = useRef<HTMLImageElement>(null);
    const {ratio} = useRatio();
    const [width, setWidth] = React.useState<number>(() => ratio.state.width);
    const [height, setHeight] = React.useState<number>(() => ratio.state.height);
    const {game} = useGame();

    useEffect(() => {
        updateWidth();

        return ratio.onUpdate(updateWidth);
    }, [ref]);

    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.attributeName === "src") {
                    if (imgRef.current) {
                        updateWidth();
                    }
                }
            });
        });

        if (imgRef.current) {
            observer.observe(imgRef.current, {attributes: true});
        }

        return () => {
            observer.disconnect();
        };
    }, []);

    function updateWidth() {
        const currentRef = ref || imgRef;
        if (currentRef.current && currentRef.current.naturalWidth) {
            if (currentRef.current.naturalWidth * currentRef.current.naturalHeight === 1) {
                const newWidth = ratio.state.width;
                const newHeight = ratio.state.height;
                const newAspectRatio = `${newWidth} / ${newHeight}`;

                setWidth(newWidth);
                setHeight(newHeight);
                currentRef.current.style.aspectRatio = newAspectRatio;

                if (onSizeChanged) {
                    onSizeChanged(newWidth, newHeight);
                }
            } else {
                const autoFitFactorWidth = autoFit ? (game.config.width / currentRef.current.naturalWidth) : 1;
                const newWidth = currentRef.current.naturalWidth * ratio.state.scale * autoFitFactorWidth;
                const newHeight = currentRef.current.naturalHeight * ratio.state.scale * autoFitFactorWidth;

                setWidth(newWidth);
                setHeight(newHeight);

                if (onSizeChanged) {
                    onSizeChanged(newWidth, newHeight);
                }
            }
        }
    }

    function handleOnLoad() {
        updateWidth();
        if (onLoad) {
            onLoad();
        }
    }

    return (
        <img
            ref={ref || imgRef}
            onLoad={handleOnLoad}
            width={width}
            height={height}
            alt={"image"}
        />
    );
}
