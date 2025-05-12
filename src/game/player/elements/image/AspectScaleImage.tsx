import React, {useEffect, useRef, forwardRef} from "react";
import {useRatio} from "@player/provider/ratio";
import {useGame} from "@core/common/player";

/**@internal */
const AspectScaleImage = forwardRef<HTMLImageElement, {
    onSizeChanged?: (width: number, height: number) => void;
    onLoad?: () => void;
    autoFit?: boolean;
}>(({
    onSizeChanged,
    onLoad,
    autoFit = false,
}, ref) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const {ratio} = useRatio();
    const [width, setWidth] = React.useState<number>(() => ratio.state.width);
    const [height, setHeight] = React.useState<number>(() => ratio.state.height);
    const game = useGame();
    const isLoadedRef = useRef(false);
    const loadPromiseRef = useRef<Promise<void> | null>(null);
    const loadResolveRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);

    // Forward the ref to the img element
    React.useImperativeHandle(ref, () => imgRef.current!, []);

    // Add loading methods to the img element
    useEffect(() => {
        if (imgRef.current) {
            Object.defineProperties(imgRef.current, {
                isLoaded: {
                    value: () => isLoadedRef.current,
                    configurable: true
                },
                waitForLoad: {
                    value: () => {
                        if (isLoadedRef.current) {
                            return Promise.resolve();
                        }
                        if (!loadPromiseRef.current) {
                            loadPromiseRef.current = new Promise((resolve) => {
                                loadResolveRef.current = resolve;
                            });
                        }
                        return loadPromiseRef.current;
                    },
                    configurable: true
                }
            });
        }
    }, []);

    useEffect(() => {
        updateWidth();

        return ratio.onUpdate(updateWidth);
    }, [onSizeChanged]);

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
    }, [onSizeChanged]);

    function updateWidth() {
        if (imgRef.current && imgRef.current.naturalWidth) {
            if (imgRef.current.naturalWidth * imgRef.current.naturalHeight === 1) {
                const newWidth = ratio.state.width;
                const newHeight = ratio.state.height;
                const newAspectRatio = `${newWidth} / ${newHeight}`;

                setWidth(newWidth);
                setHeight(newHeight);
                imgRef.current.style.aspectRatio = newAspectRatio;

                if (onSizeChanged) {
                    onSizeChanged(newWidth, newHeight);
                }
            } else {
                const autoFitFactorWidth = autoFit ? (game.config.width / imgRef.current.naturalWidth) : 1;
                const newWidth = imgRef.current.naturalWidth * ratio.state.scale * autoFitFactorWidth;
                const newHeight = imgRef.current.naturalHeight * ratio.state.scale * autoFitFactorWidth;

                setWidth(newWidth);
                setHeight(newHeight);
                imgRef.current.style.aspectRatio = "auto";

                if (onSizeChanged) {
                    onSizeChanged(newWidth, newHeight);
                }
            }
        }
    }

    function handleOnLoad() {
        updateWidth();
        isLoadedRef.current = true;
        if (loadResolveRef.current) {
            loadResolveRef.current();
            loadResolveRef.current = null;
            loadPromiseRef.current = null;
        }
        if (onLoad) {
            onLoad();
        }
    }

    return (
        <img
            ref={imgRef}
            onLoad={handleOnLoad}
            width={width}
            height={height}
            alt={""}
        />
    );
});

AspectScaleImage.displayName = "AspectScaleImage";

export default AspectScaleImage;
