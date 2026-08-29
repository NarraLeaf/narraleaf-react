import {Image as GameImage} from "@core/elements/displayable/image";
import React, {forwardRef, useCallback, useImperativeHandle, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import clsx from "clsx";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {Utils} from "@core/common/Utils";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {usePreloaded} from "@player/provider/preloaded";
import {motion} from "motion/react";
import {EventDispatcher} from "@lib/util/data";
import {useExposeState} from "@player/lib/useExposeState";
import {DisplayableElementRef} from "@player/elements/displayable/type";
import {ExposedStateType} from "@player/type";
import {Color, ImageSrc} from "@core/types";

export type ImageEvents = {
    "event:image.onLoad": [];
};

/* Layers of one image share a canvas, so centering each of them on the stack is what keeps
   them aligned. This style is static: everything that applies to the stack as a whole is
   written to the wrapper instead, never here. */
const layerStyle: React.CSSProperties = {
    position: "absolute",
    transformOrigin: "center",
    transform: "translate(-50%, -50%)",
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    maxWidth: "none",
    maxHeight: "none",
};

/* A stack of layers that behaves like a single image to the transition machinery: group-wide
   effects land on this wrapper, and `waitForLoad` reports the whole stack so a transition still
   waits for every incoming layer to decode before it starts. Effects must not be applied to the
   layers individually — a per-layer opacity would composite each layer against the background on
   its own and let the layers below show through the ones above them. */
const LayerStack = forwardRef<DisplayableElementRef<HTMLDivElement>, {
    src: (string | null)[];
    autoFit?: boolean;
    resolveSrc: (src: string) => string;
    onSizeChanged?: (width: number, height: number) => void;
    onLoad?: () => void;
}>(({src, autoFit, resolveSrc, onSizeChanged, onLoad}, ref) => {
    const stackRef = useRef<HTMLDivElement>(null);
    const layerRefs = useRef<(DisplayableElementRef<HTMLImageElement> | null)[]>([]);
    const sizingLayer = src.findIndex((layer) => layer !== null);

    useImperativeHandle(ref, () => Object.assign(stackRef.current!, {
        isLoaded: () => layerRefs.current.every((layer) => !layer?.isLoaded || layer.isLoaded()),
        waitForLoad: () => Promise.all(
            layerRefs.current.map((layer) => layer?.waitForLoad ? layer.waitForLoad() : Promise.resolve())
        ).then(() => undefined),
    }), []);

    return (
        <div ref={stackRef}>
            {src.map((layer, i) => layer === null ? null : (
                <AspectScaleImage
                    key={"layer-" + i}
                    ref={(element) => {
                        layerRefs.current[i] = element as DisplayableElementRef<HTMLImageElement> | null;
                    }}
                    src={resolveSrc(layer)}
                    style={layerStyle}
                    autoFit={autoFit}
                    onSizeChanged={i === sizingLayer ? onSizeChanged : undefined}
                    onLoad={i === sizingLayer ? onLoad : undefined}
                />
            ))}
        </div>
    );
});
LayerStack.displayName = "LayerStack";

/* Written to a stack wrapper, so it covers the container and every layer inside centres on it.
   Brightness belongs here rather than on the layers: it scales RGB before compositing, so
   darkening the stack once is identical to darkening each layer, and it leaves the property free
   for a Darkness transition to animate.

   This doubles as the stack's settled pose: it is re-applied on its own once a transition ends,
   so it must name every property any transition writes to a stack. A property left out is not
   neutral — it keeps whatever the last animation frame put there. That is survivable while a
   transition completes (its final frame is the resting value anyway), but `cancel()` stops the
   animation mid-flight without a final frame — an undo of an in-flight action does exactly this —
   and the half-way value would then stick forever. So each one below is reset to the value that
   means "no transition is acting on this": the stack carries no offset (`inset: 0` positions it)
   and no mask of its own, so identity is `none` throughout, and group opacity lives on the
   wrapper rather than here. Resetting is safe because a running transition's resolver output is
   merged over this base, and a freshly mounted stack starts at these values regardless.

   The non-layered path already gets this for free — its settled style resets `transform` and the
   insets the same way.

   `layeredStackStyle.test.ts` pins this list against what the built-in transitions actually
   write, so a transition cannot start writing a property without this naming it. */
export function stackStyle(darkness: number): React.CSSProperties {
    return {
        willChange: "filter, opacity",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        transform: "none",
        translate: "none",
        opacity: 1,
        clipPath: "none",
        maskImage: "none",
        WebkitMaskImage: "none",
        maskSize: "auto",
        WebkitMaskSize: "auto",
        maskRepeat: "repeat",
        WebkitMaskRepeat: "repeat",
        filter: `brightness(${1 - darkness})`,
    };
}

/* What a non-layered image paints when no transition owns it. `state.currentSrc` is not that:
   a tag-src image stores its *tags* there, and only the image's own definition knows which url
   they resolve to. A static image keeps its state as-is, so that a colour src (backgrounds) and
   `StaticImageData` still reach the caller intact. A transition, by contrast, carries sources it
   already resolved, so it never needs this. */
function settledSrc(image: GameImage): Color | ImageSrc | undefined {
    if (GameImage.isStaticSrc(image)) {
        return image.state.currentSrc as Color | ImageSrc;
    }
    return GameImage.getSrcURL(image) ?? undefined;
}

/* The base style a transition's own element sits on, matching what a non-layered image uses. */
const overlayStyle: React.CSSProperties = {
    position: "absolute",
    transformOrigin: "center",
    transform: "translate(-50%, -50%)",
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    maxWidth: "none",
    maxHeight: "none",
};

function ImageComponent(
    {
        image,
        state,
    }: Readonly<{
        image: GameImage;
        state: GameState;
    }>) {
    const [events] = useState<EventDispatcher<ImageEvents>>(() => new EventDispatcher<ImageEvents>());
    const [wearables, setWearables] = useState<GameImage[]>([]);
    const {cacheManager} = usePreloaded();
    const ignored = useRef<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const layerSrc: (string | null)[] | null = GameImage.isLayeredSrc(image)
        ? GameImage.getSrcURLs(image)
        : null;

    function resolveCachedSrc(src: string): string {
        if (!Utils.isInlineSrc(src)
            && (!cacheManager.has(src) && !cacheManager.isPreloading(src))
            && !ignored.current.includes(src)
        ) {
            state.game.getLiveGame().getGameState()?.logger.warn("Image",
                `Image not preloaded: "${src}". `
                + "\nThis may be caused by complicated image action behavior that cannot be predicted. "
                + "\nTo fix this issue, you can manually register the image using scene.preloadImage(YourImageSrc). "
            );
            ignored.current.push(src);
        }
        return cacheManager.get(src) || src;
    }

    const {
        transformRef,
        transitionRefs,
        transitionTask,
        initDisplayable,
        applyTransition,
        applyTransform,
        applyLoop,
        stopLoop,
        updateStyleSync,
        flush,
        deps,
    } = useDisplayable<ImageTransition, HTMLImageElement>({
        element: image,
        state: image.transformState,
        skipTransform: state.game.config.allowSkipImageTransform,
        skipTransition: state.game.config.allowSkipImageTransition,
        transitionsProps: (task) => {
            if (layerSrc) {
                // Index-aligned with the transition's resolvers: a keyed resolver drives a stack
                // wrapper, an unkeyed one drives a plain image the transition adds on top of the
                // stacks (ThroughColor's colour frame).
                const resolvers = task ? task.task.resolve : [null];
                return resolvers.map((resolver) =>
                    resolver && typeof resolver === "function"
                        ? {style: overlayStyle}
                        : {style: stackStyle(image.state.darkness)}
                );
            }

            const currentSrc = task ? task.transition._getCurrentSrc() : settledSrc(image);
            return [
                {
                    style: {
                        willChange: "filter",
                        position: "absolute",
                        transformOrigin: "center",
                        backgroundColor: Utils.isColor(currentSrc) ? Utils.colorToString(currentSrc) : undefined,
                        transform: "none",
                        top: "auto",
                        left: "auto",
                        right: "auto",
                        bottom: "auto",
                        filter: `brightness(${1 - image.state.darkness})`,
                    },
                    src: Utils.isImageSrc(currentSrc) ? Utils.srcToURL(currentSrc) : GameImage.DefaultImagePlaceholder,
                },
                {
                    style: {
                        willChange: "filter",
                        position: "absolute",
                        transformOrigin: "center",
                        transform: "translate(-50%, -50%)",
                        top: "50%",
                        left: "50%",
                        right: "auto",
                        bottom: "auto",
                        maxWidth: "none",
                        maxHeight: "none",
                        filter: "brightness(1)",
                    }
                }
            ];
        },
        propOverwrite: (props) => {
            if (props.src) {
                return {
                    ...props,
                    src: resolveCachedSrc(props.src),
                };
            }
            return props;
        }
    });

    useExposeState<ExposedStateType.image>(image, {
        createWearable: (wearable: GameImage) => {
            setWearables((prev) => [...prev, wearable]);
        },
        disposeWearable: (wearable: GameImage) => {
            setWearables((prev) => prev.filter((w) => w.getId() !== wearable.getId()));
        },
        initDisplayable,
        applyTransform,
        applyLoop,
        stopLoop,
        applyTransition,
        events,
        updateStyleSync,
        flush,
    }, [...deps]);

    /* Stable identities: these are handed to AspectScaleImage/LayerStack as `onSizeChanged` /
       `onLoad`, whose sizing effect re-runs on every identity change. A fresh closure per render
       is what once turned every stage flush into a redundant size pass across all on-stage
       images; with a stable callback, the effect re-runs only when an element's role genuinely
       changes (a settled transition promoting its target to the sizing element). */
    const handleWidthChange = useCallback((width: number, height: number) => {
        if (containerRef.current) {
            events.emit("event:image.onLoad");
            Object.assign(containerRef.current.style, {
                width: `${width}px`,
                height: `${height}px`,
            });
        }
    }, [events]);

    const handleOnLoad = useCallback(() => {
        events.emit("event:image.onLoad");
    }, [events]);

    return (
        /* No `layout` here: the wrapper's transform is written imperatively, frame by frame,
           by `transform.animate` — layout projection measures on any re-render (stage resizes,
           transition start/end) and writes to the same node, so the two fight mid-animation,
           and an interrupted projection leaves a corrupt `transform` behind. */
        <motion.div
            ref={transformRef}
            className={"absolute w-max h-max"}
            data-element-type={"image"}
        >
            <div className={"relative h-full w-full"} ref={containerRef} data-image-id={image.getId()}>
                {layerSrc ? transitionRefs.map(([ref, key], i) => {
                    const resolver = transitionTask ? transitionTask.task.resolve[i] : null;
                    if (resolver && typeof resolver === "function") {
                        return (
                            <AspectScaleImage
                                key={key}
                                ref={ref as React.Ref<HTMLImageElement>}
                                autoFit={image.config.autoFit}
                            />
                        );
                    }
                    const stack = !resolver ? layerSrc
                        : resolver.key === "target"
                            ? transitionTask!.transition._getTargetLayers()
                            : transitionTask!.transition._getPrevLayers();
                    return (
                        <LayerStack
                            key={key}
                            ref={ref as React.Ref<DisplayableElementRef<HTMLDivElement>>}
                            src={stack || layerSrc}
                            autoFit={image.config.autoFit}
                            resolveSrc={resolveCachedSrc}
                            onSizeChanged={i === 0 ? handleWidthChange : undefined}
                            onLoad={i === 0 ? handleOnLoad : undefined}
                        />
                    );
                }) : transitionRefs.map(([ref, key], i) => (
                    <AspectScaleImage
                        key={key}
                        ref={ref}
                        autoFit={image.config.autoFit}
                        onSizeChanged={i === 0 ? handleWidthChange : undefined}
                        onLoad={i === 0 ? handleOnLoad : undefined}
                    />
                ))}
                <div className={clsx("w-full h-full top-0 left-0 absolute")}>
                    {wearables.map((wearable) => (
                        <div
                            className={clsx("w-full h-full relative")}
                            key={"wearable-" + wearable.getId()}
                        >
                            <Image image={wearable} state={state}/>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

// A stage `flush()` re-renders the whole Player tree, but an Image's props (`image`, `state`) are
// stable across it — the element only needs to repaint when its own transform/transition fires,
// which it drives through its internal `useFlush`. Memoizing decouples it from the global cascade,
// so N on-stage images no longer all re-render (and re-run their sizing effects) on every advance.
const Image = React.memo(ImageComponent);
export default Image;
