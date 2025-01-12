import React, {useEffect, useRef} from "react";
import {useRatio} from "@player/provider/ratio";
import {useGame} from "@core/common/player";

/**@internal */
export default function AspectScaleImage(
    {
        ref,
        onSizeChanged,
        autoFit = false,
    }: Readonly<{
        ref?: React.RefObject<HTMLImageElement | null>;
        onSizeChanged?: (width: number, height: number) => void;
        autoFit?: boolean;
    }>
) {
    const imgRef = useRef<HTMLImageElement>(null);
    const {ratio} = useRatio();
    const [width, setWidth] = React.useState<number>(0);
    const [height, setHeight] = React.useState<number>(0);
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
            const autoFitFactor = autoFit ? (game.config.player.width / currentRef.current.naturalWidth) : 1;
            const newWidth = currentRef.current.naturalWidth * ratio.state.scale * autoFitFactor;
            const newHeight = currentRef.current.naturalHeight * ratio.state.scale * autoFitFactor;

            setWidth(newWidth);
            setHeight(newHeight);

            if (onSizeChanged) {
                onSizeChanged(newWidth, newHeight);
            }
        }
    }

    function handleOnLoad() {
        updateWidth();
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
