import {Image as GameImage} from "@core/elements/displayable/image";
import React, {forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import clsx from "clsx";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {Utils} from "@core/common/Utils";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {ElementProp, TransitionTask} from "@core/elements/transition/type";
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

/* The transition group whose size the image's box takes. The box is what sizes the wrapper the
   image's transform state places, so the group at this index is the one that sits in its box the
   way an image at rest does, and every other group is placed relative to it. */
const SIZING_GROUP = 0;

/** A laid-out size, in CSS pixels. */
export type GroupSize = { width: number; height: number };

/* Two sizes closer than this are one size. A picture's size is worked out from its natural size,
   and two pictures that agree on paper can disagree in the last bits of a float; nothing that
   small reaches the layout grid, which is 1/64 of a device pixel. */
const SAME_SIZE_TOLERANCE = 1 / 1024;

/**
 * Where a transition puts a group that does not size the box: on the very pixels it will cover
 * once it is the image at rest. `null` means exactly where a picture at rest sits.
 *
 * The box takes the sizing group's size, and the wrapper around it is placed by a layout anchor (a
 * percentage of the stage, measured from the top - or from the bottom on an inverted axis) plus a
 * `translate` of half its own size. The stage is scaled by a non-integer factor, so these lengths
 * fall between device pixels, and the browser snaps layout positions to the pixel grid while
 * leaving translations where they are. A group of the box's size therefore sits in it exactly as
 * an image at rest does - by layout, on its corner, with no transform of its own - and comes out
 * on the same pixels. That is the common case (two backgrounds of one size, a picture fading into
 * itself, a character's expressions), and adding anything to it, even a translate of nothing, can
 * change how a scaled wrapper's content is sampled.
 *
 * A group of another size has to make up the difference inside the box, and how it does so decides
 * what the browser draws. Centred by layout (`top: 50%`, a flex box, auto margins), or by a
 * transform alone, it lands within a pixel of its resting place but on the other side of a
 * rounding; it is drawn resampled at a slightly different offset, and when the transition ends and
 * the box takes its size, the whole picture steps by a fraction of a pixel and changes sharpness.
 * So the difference is split the way the wrapper will split it at rest. On an axis anchored at the
 * top or left the wrapper's layout position does not depend on its size: the group sits on that
 * edge of the box and a translate moves it by half the size difference - the half the wrapper's own
 * translate stops adding once the box has the group's size. On an inverted axis the wrapper is
 * anchored at its bottom or right edge, so its layout position moves with its size: the group sits
 * on that edge instead, which puts its layout position where the wrapper's will be, and the
 * translate takes the other half back. Every length that gets snapped is then one that will be
 * snapped at rest, and the unsnapped ones add up to the translate the wrapper will carry.
 *
 * Under a wrapper that also scales or rotates, the browser drops the fraction of the wrapper's own
 * layout position before transforming, so on an inverted axis a group of another size can still be
 * sampled a little differently from the way it will be at rest; it is never displaced.
 *
 * Transitions that move a group write the independent `translate` property, which composes with
 * this.
 */
export function transitionGroupPlacement(
    box: GroupSize,
    own: GroupSize,
    invertX: boolean,
    invertY: boolean,
): React.CSSProperties | null {
    const halfX = (box.width - own.width) / 2;
    const halfY = (box.height - own.height) / 2;
    if (Math.abs(halfX) * 2 < SAME_SIZE_TOLERANCE && Math.abs(halfY) * 2 < SAME_SIZE_TOLERANCE) {
        return null;
    }
    return {
        top: invertY ? "auto" : 0,
        bottom: invertY ? 0 : "auto",
        left: invertX ? "auto" : 0,
        right: invertX ? 0 : "auto",
        transform: `translate(${invertX ? -halfX : halfX}px, ${invertY ? -halfY : halfY}px)`,
    };
}

/**
 * A size reported for an element that may not be attached yet, written to it as soon as it is.
 *
 * A picture reports its size from a layout effect, so that the incoming picture of a transition
 * sizes the image's box in the very commit that puts it at rest. On the first commit, though, that
 * effect runs before React has attached the refs of the elements around the picture, so a picture
 * already decoded when it mounts reports a size nothing can take yet. The size is kept and written
 * by the owner's own layout effect, which runs once its refs are attached; every later report is
 * written straight away. `beforeWrite` runs ahead of each write.
 */
function useReportedSize(
    ref: React.RefObject<HTMLElement | null>,
    beforeWrite?: () => void,
): (width: number, height: number) => void {
    const size = useRef<{ width: number; height: number } | null>(null);
    const write = useCallback(() => {
        if (!ref.current || !size.current) {
            return;
        }
        beforeWrite?.();
        Object.assign(ref.current.style, {
            width: `${size.current.width}px`,
            height: `${size.current.height}px`,
        });
    }, [ref, beforeWrite]);

    useLayoutEffect(() => {
        write();
    }, []);

    return useCallback((width: number, height: number) => {
        size.current = {width, height};
        write();
    }, [write]);
}

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

    /* The stack carries its own size as well as reporting it. At rest that is the box's size, so
       nothing moves; during a transition it is what lets a stack that does not size the box be
       placed against its own size (see `transitionGroupPlacement`). */
    const sizeStack = useReportedSize(stackRef);
    const handleSizeChanged = useCallback((width: number, height: number) => {
        sizeStack(width, height);
        onSizeChanged?.(width, height);
    }, [sizeStack, onSizeChanged]);

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
                    onSizeChanged={i === sizingLayer ? handleSizeChanged : undefined}
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
   merged over this base, and a freshly mounted stack starts at these values regardless. The same
   goes for the placement a stack that does not size the box is given while a transition runs
   (`transitionGroupPlacement`): its insets and `transform` are among the values reset here.

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

/* How a non-layered picture sits in its box when it is the picture at rest: by layout, on the
   box's corner, with the box sized to it. */
function restingImageStyle(darkness: number): React.CSSProperties {
    return {
        willChange: "filter",
        position: "absolute",
        transformOrigin: "center",
        transform: "none",
        top: "auto",
        left: "auto",
        right: "auto",
        bottom: "auto",
        filter: `brightness(${1 - darkness})`,
    };
}

/**
 * The props each group of a running transition sits on, index-aligned with the transition's
 * resolvers; a resolver's own frame is merged over them.
 *
 * The group that sizes the box stays exactly as it is at rest, and every other group the transition
 * shows sits where it will rest once it sizes the box itself (see `transitionGroupPlacement`), so
 * neither moves, nor changes how it is sampled, when the transition starts or when it ends. A
 * group whose size is not known yet has not loaded and shows nothing; it is placed as at rest until
 * it has. A keyed resolver drives a picture - a stack wrapper on the layered path - and an unkeyed
 * one drives an element of the transition's own (ThroughColor's colour frame), centred over the box
 * and gone once the transition ends.
 *
 * None of these names a `src`: each side's resolver carries its own. A base that named one would
 * point the outgoing picture somewhere else for the moment between the two writes, which is long
 * enough for the browser to drop the decoded picture and paint a frame without it.
 */
export function transitionGroupProps(
    resolve: TransitionTask<HTMLImageElement, any>["resolve"],
    options: {
        layered: boolean;
        darkness: number;
        invertX: boolean;
        invertY: boolean;
        /** The laid-out size of each group, index-aligned with `resolve`, where it is known. */
        sizes: (GroupSize | undefined)[];
    },
): ElementProp<HTMLImageElement>[] {
    return transitionGroupStyles(resolve, options).map((style) => ({style}));
}

function transitionGroupStyles(
    resolve: TransitionTask<HTMLImageElement, any>["resolve"],
    {layered, darkness, invertX, invertY, sizes}: {
        layered: boolean;
        darkness: number;
        invertX: boolean;
        invertY: boolean;
        sizes: (GroupSize | undefined)[];
    },
): React.CSSProperties[] {
    const box = sizes[SIZING_GROUP];
    return resolve.map((resolver, i) => {
        if (typeof resolver === "function") {
            return layered ? overlayStyle : {...overlayStyle, willChange: "filter", filter: "brightness(1)"};
        }
        const own = sizes[i];
        const placement = i !== SIZING_GROUP && box && own
            ? transitionGroupPlacement(box, own, invertX, invertY)
            : null;
        if (layered) {
            return placement ? {...stackStyle(darkness), ...placement} : stackStyle(darkness);
        }
        return placement
            ? {...restingImageStyle(darkness), maxWidth: "none", maxHeight: "none", ...placement}
            : restingImageStyle(darkness);
    });
}

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
    /* Every group's laid-out size, under the key of the group that reported it, and the keys of the
       groups on stage in transition order. A transition places each group against the box's size
       and its own (`transitionGroupProps`), and a group only knows its size once its picture has
       loaded - so these are read each time the groups' props are worked out, not once. */
    const groupSizes = useRef(new Map<string, GroupSize>());
    const groupKeys = useRef<string[]>([]);
    const layerSrc: (string | null)[] | null = GameImage.isLayeredSrc(image)
        ? GameImage.getSrcURLs(image)
        : null;

    function resolveCachedSrc(src: string): string {
        // `wasCached` and not `has`: an image the cache fetched and a memory budget has since let go
        // of is the cache working as designed, and warning about it would tell the author to fix
        // something that is not broken. What is worth a warning is an image the preloader never
        // heard of at all, which is an action nothing could predict.
        if (!Utils.isInlineSrc(src)
            && (!cacheManager.wasCached(src) && !cacheManager.isPreloading(src))
            && !ignored.current.includes(src)
        ) {
            // The host hears about it first when it wants to: it planned the warm set, so it is the
            // only thing that can say which row shows this and why nothing warmed it. The warning
            // below is the answer for a game with no strategy of its own, and it names the remedy
            // such a game actually has.
            if (!cacheManager.reportMissing(src)) {
                state.game.getLiveGame().getGameState()?.logger.warn("Image",
                    `Image not preloaded: "${src}". `
                    + "\nThis may be caused by complicated image action behavior that cannot be predicted. "
                    + "\nTo fix this issue, you can manually register the image using scene.preloadImage(YourImageSrc). "
                );
            }
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
            if (task) {
                const {invertX, invertY} = state.getStory().getInversionConfig();
                return transitionGroupProps(task.task.resolve, {
                    layered: !!layerSrc,
                    darkness: image.state.darkness,
                    invertX,
                    invertY,
                    sizes: groupKeys.current.map((key) => groupSizes.current.get(key)),
                });
            }
            if (layerSrc) {
                return [{style: stackStyle(image.state.darkness)}];
            }
            const currentSrc = settledSrc(image);
            return [{
                style: {
                    ...restingImageStyle(image.state.darkness),
                    backgroundColor: Utils.isColor(currentSrc) ? Utils.colorToString(currentSrc) : undefined,
                },
                src: Utils.isImageSrc(currentSrc) ? Utils.srcToURL(currentSrc) : GameImage.DefaultImagePlaceholder,
            }];
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
    const handleOnLoad = useCallback(() => {
        events.emit("event:image.onLoad");
    }, [events]);
    const handleWidthChange = useReportedSize(containerRef, handleOnLoad);

    /* One size callback per group and role, kept for as long as the group is on stage: each group
       reports its size, and the one that sizes the box also sizes it. The identity changes with the
       role only, which is exactly when the box has to take a new size - a transition ending. */
    const sizeHandlers = useRef(new Map<string, (width: number, height: number) => void>());
    const groupSizeHandler = (key: string, sizing: boolean) => {
        const id = sizing ? `${key}:sizing` : key;
        let handler = sizeHandlers.current.get(id);
        if (!handler) {
            handler = (width: number, height: number) => {
                groupSizes.current.set(key, {width, height});
                if (sizing) {
                    handleWidthChange(width, height);
                }
            };
            sizeHandlers.current.set(id, handler);
        }
        return handler;
    };
    groupKeys.current = transitionRefs.map(([, key]) => key);
    useLayoutEffect(() => {
        const live = new Set(groupKeys.current);
        groupSizes.current.forEach((_size, key) => {
            if (!live.has(key)) {
                groupSizes.current.delete(key);
            }
        });
        sizeHandlers.current.forEach((_handler, id) => {
            if (!live.has(id.replace(/:sizing$/, ""))) {
                sizeHandlers.current.delete(id);
            }
        });
    });

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
                            onSizeChanged={groupSizeHandler(key, i === SIZING_GROUP)}
                            onLoad={i === SIZING_GROUP ? handleOnLoad : undefined}
                        />
                    );
                }) : transitionRefs.map(([ref, key], i) => (
                    <AspectScaleImage
                        key={key}
                        ref={ref}
                        autoFit={image.config.autoFit}
                        onSizeChanged={groupSizeHandler(key, i === SIZING_GROUP)}
                        onLoad={i === SIZING_GROUP ? handleOnLoad : undefined}
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
