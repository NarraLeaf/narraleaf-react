import React, {useEffect, useRef, forwardRef} from "react";
import {useRatio} from "@player/provider/ratio";
import {useGame} from "@core/common/player";
import {useHoldImageSrc} from "@player/lib/useHoldImageSrc";

const AspectScaleImage = forwardRef<HTMLImageElement, {
    onSizeChanged?: (width: number, height: number) => void;
    onLoad?: () => void;
    autoFit?: boolean;
    src?: string;
    style?: React.CSSProperties;
}>(({
    onSizeChanged,
    onLoad,
    autoFit = false,
    src,
    style,
}, ref) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const {ratio} = useRatio();
    // 0 until the bitmap's real size is known: a fresh element paints nothing rather than one
    // stretched frame at the stage size (these attributes only apply between mount and the first
    // `updateWidth`, which follows the load event).
    const [width, setWidth] = React.useState<number>(0);
    const [height, setHeight] = React.useState<number>(0);
    // Remember the last size we actually applied. `updateWidth` re-runs on renders, ratio updates
    // and src mutations, and re-applying an unchanged size only risks feeding a render loop that
    // amplifies with the number of on-stage images. Skipping the redundant apply keeps the element
    // correct while breaking the loop.
    const lastAppliedRef = useRef<{ w: number; h: number; ar: string } | null>(null);
    // The callback we last reported the size to. It can change identity while the size does not —
    // when a transition settles, this element is promoted to the one that sizes the parent
    // container (`onSizeChanged` flips from `undefined` to the parent's handler), and the parent's
    // stored size is stale even though ours isn't. A guard keyed on the size alone swallowed that
    // notification and left the container at the previous image's size.
    const lastNotifiedRef = useRef<((width: number, height: number) => void) | null>(null);
    const game = useGame();
    const isLoadedRef = useRef(false);
    const loadPromiseRef = useRef<Promise<void> | null>(null);
    const loadResolveRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);

    // Forward the ref to the img element
    React.useImperativeHandle(ref, () => imgRef.current!, []);

    // Whatever url this element ends up showing - through the `src` prop or written by a
    // transition - is on stage, and the cache must not take it back until the element lets go.
    useHoldImageSrc(imgRef);

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
                        // Resolving on `load` alone is not enough: a large image can be fully
                        // loaded but not yet decoded, and revealing it then paints a blank
                        // frame while the browser decodes asynchronously. Wait for the decode
                        // too, falling back to load-only behavior if decoding is unsupported
                        // or fails (e.g. EncodingError), so the wait can never dead-lock.
                        const waitForDecode = (): Promise<void> => {
                            const img = imgRef.current;
                            if (!img || typeof img.decode !== "function") {
                                return Promise.resolve();
                            }
                            return img.decode().catch(() => void 0);
                        };
                        if (isLoadedRef.current) {
                            return waitForDecode();
                        }
                        if (!loadPromiseRef.current) {
                            loadPromiseRef.current = new Promise((resolve) => {
                                loadResolveRef.current = resolve;
                            });
                        }
                        return loadPromiseRef.current.then(waitForDecode);
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
            let newWidth: number;
            let newHeight: number;
            let newAspectRatio: string;
            if (imgRef.current.naturalWidth * imgRef.current.naturalHeight === 1) {
                newWidth = ratio.state.width;
                newHeight = ratio.state.height;
                newAspectRatio = `${newWidth} / ${newHeight}`;
            } else {
                const autoFitFactorWidth = autoFit ? (game.config.width / imgRef.current.naturalWidth) : 1;
                newWidth = imgRef.current.naturalWidth * ratio.state.scale * autoFitFactorWidth;
                newHeight = imgRef.current.naturalHeight * ratio.state.scale * autoFitFactorWidth;
                newAspectRatio = "auto";
            }

            const last = lastAppliedRef.current;
            const sizeChanged = !last || last.w !== newWidth || last.h !== newHeight || last.ar !== newAspectRatio;
            const callbackChanged = !!onSizeChanged && lastNotifiedRef.current !== onSizeChanged;
            // Nothing changed and the same callback already knows this size — repeating the work
            // only risks a render loop.
            if (!sizeChanged && !callbackChanged) {
                return;
            }

            if (sizeChanged) {
                lastAppliedRef.current = { w: newWidth, h: newHeight, ar: newAspectRatio };
                setWidth(newWidth);
                setHeight(newHeight);
                imgRef.current.style.aspectRatio = newAspectRatio;
            }
            if (onSizeChanged) {
                lastNotifiedRef.current = onSizeChanged;
                onSizeChanged(newWidth, newHeight);
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

    function handleOnError() {
        // A source that fails still settles the load: the pre-transition gate waits on
        // `waitForLoad`, and a broken url must not wedge the transition forever. The decode
        // fallback inside `waitForLoad` tolerates an undecodable bitmap.
        isLoadedRef.current = true;
        if (loadResolveRef.current) {
            loadResolveRef.current();
            loadResolveRef.current = null;
            loadPromiseRef.current = null;
        }
    }

    return (
        <img
            ref={imgRef}
            onLoad={handleOnLoad}
            onError={handleOnError}
            width={width}
            height={height}
            alt={""}
            src={src}
            style={style}
        />
    );
});

AspectScaleImage.displayName = "AspectScaleImage";

export default AspectScaleImage;
