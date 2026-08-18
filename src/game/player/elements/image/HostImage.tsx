import React, {useEffect, useMemo, useRef} from "react";
import {Image as GameImage} from "@core/elements/displayable/image";
import {GameState} from "@player/gameState";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {usePreloaded} from "@player/provider/preloaded";
import {useExposeState} from "@player/lib/useExposeState";
import {ExposedStateType} from "@player/type";
import {useFlush} from "@player/lib/flush";
import {EventDispatcher} from "@lib/util/data";
import {Utils} from "@core/common/Utils";
import Inspect from "@player/lib/Inspect";
import type {ImageBackendContent, ImageBackendInstance, ImageBackendSize} from "@core/game/image/imageBackend";
import type {ImageEvents} from "@player/elements/image/Image";

/**
 * An image the engine resolves and a host draws.
 *
 * The engine's half is unchanged and complete: the element is placed, transformed, layered, faded
 * and saved exactly as any other image, and which picture it is showing is still decided by its own
 * source state. What differs is only the last step — instead of putting the resolved URLs into
 * `<img>` elements, they are handed to the backend named in `config.backend`.
 *
 * The box is the element's `size` (the stage size when it is null), fixed rather than measured: a
 * host-drawn image has no picture of its own to be sized by, and what is inside is the host's
 * business.
 *
 * Two things a host-drawn image deliberately does not do:
 *
 * **No image transitions.** A transition between two sources is a cross-fade of two presentations,
 * and there is only one presentation here — the backend's. A source change therefore arrives as a
 * single `apply`, and a backend that wants it to be gradual animates it itself. Transitions on the
 * element as a whole (fade in, slide, mask) are untouched: they act on the wrapper, above the box.
 *
 * **No wearables.** A wearable is an image positioned against its parent's own picture, which is
 * exactly what a host has replaced. Attaching one warns and draws nothing rather than silently
 * putting it somewhere meaningless.
 */
export default function HostImage(
    {image, state}: Readonly<{ image: GameImage; state: GameState }>
) {
    const [flush] = useFlush();
    const [events] = React.useState<EventDispatcher<ImageEvents>>(() => new EventDispatcher<ImageEvents>());
    const {cacheManager} = usePreloaded();
    const hostRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<ImageBackendInstance | null>(null);

    const size: ImageBackendSize = useMemo(() => image.config.size ?? {
        width: state.game.config.width,
        height: state.game.config.height,
    }, [image.config.size, state.game.config.width, state.game.config.height]);
    const sizeRef = useRef<ImageBackendSize>(size);
    sizeRef.current = size;

    const resolveSrc = React.useCallback(
        (src: string) => cacheManager.get(src) || src,
        [cacheManager]
    );

    /* What the element is showing, resolved the same way the engine's own presentation resolves it:
       a layered image is its stack, anything else is a list of one, and a colour is not a picture. */
    const content: ImageBackendContent = useMemo(() => {
        if (GameImage.isLayeredSrc(image)) {
            return {
                srcs: GameImage.getSrcURLs(image).map((src) => src === null ? null : resolveSrc(src)),
                colour: null,
            };
        }
        const current = GameImage.isStaticSrc(image) ? image.state.currentSrc : GameImage.getSrcURL(image);
        if (Utils.isColor(current)) {
            return {srcs: [], colour: Utils.colorToString(current)};
        }
        const url = typeof current === "string" ? current : (current ? Utils.srcToURL(current as never) : null);
        return {srcs: [url === null ? null : resolveSrc(url)], colour: null};
    }, [image, image.state.currentSrc, resolveSrc]);
    const contentKey = JSON.stringify(content);

    const {
        transformRef,
        transitionRefs,
        initDisplayable,
        applyTransform,
        applyTransition,
        updateStyleSync,
        deps,
    } = useDisplayable<ImageTransition, HTMLDivElement>({
        element: image,
        state: image.transformState,
        skipTransform: state.game.config.allowSkipImageTransform,
        skipTransition: state.game.config.allowSkipImageTransition,
        transitionsProps: [
            {
                style: {
                    position: "relative",
                    width: `${size.width}px`,
                    height: `${size.height}px`,
                },
            },
        ],
    });

    useExposeState<ExposedStateType.image>(image, {
        createWearable: () => {
            state.logger.warn("Image",
                `Image "${image.config.name}" is drawn by the "${image.config.backend}" backend, which owns its `
                + "presentation; a wearable attached to it has nothing to be positioned against and is ignored."
            );
        },
        disposeWearable: () => undefined,
        initDisplayable,
        applyTransform,
        applyTransition,
        events,
        updateStyleSync,
        flush,
    }, [...deps]);

    /* Read through a ref inside the mount effect so that a source change does not remount the
       backend — the mount is once per element on stage, and everything after it is an `apply`. */
    const contentRef = useRef<ImageBackendContent>(content);
    contentRef.current = content;

    // Mount once, for as long as the element is on stage — the same bargain a puppet strikes. The
    // backend never has to survive a change of what is being shown; that arrives through `apply`.
    useEffect(() => {
        const container = hostRef.current;
        if (!container) {
            return;
        }
        const backendName = image.config.backend;
        if (!backendName) {
            return;
        }
        const backend = state.game.getImageBackend(backendName);
        if (!backend) {
            // Hosts bring their own presenters, so a missing one is a normal state, not a crash.
            state.game.getImageBackendRegistry().reportMissing(backendName, (message) => {
                state.logger.warn("Image", message);
            });
            return;
        }
        let instance: ImageBackendInstance;
        try {
            instance = backend.mount(container, {
                content: contentRef.current,
                size: sizeRef.current,
                options: image.config.options,
                elementId: image.getId(),
                resolveSrc,
                warn: (message: string, detail?: unknown) => {
                    state.logger.warn("Image", message, detail);
                },
            });
        } catch (e) {
            state.logger.error("Image",
                `Image backend "${backendName}" threw while mounting "${image.config.name}"`, e);
            return;
        }
        instanceRef.current = instance;
        void instance.ready?.().then(() => events.emit("event:image.onLoad"));
        return () => {
            instanceRef.current = null;
            try {
                instance.dispose?.();
            } catch (e) {
                state.logger.error("Image", `Image backend "${backendName}" threw while disposing`, e);
            }
        };
    }, [image, image.config.backend, resolveSrc, state, events]);

    useEffect(() => {
        instanceRef.current?.apply?.(contentRef.current);
        // contentKey rather than the object: the content is rebuilt on every flush, and applying an
        // identical one would push a redraw through the host on every unrelated stage change.
    }, [contentKey]);

    useEffect(() => {
        instanceRef.current?.resize?.(size);
    }, [size.width, size.height]);

    return (
        <Inspect.Div data-element-type={"image"}>
            {/* No `layout`: the wrapper's transform is written imperatively, frame by frame. */}
            <Inspect.mDiv
                tag={"image.hostContainer"}
                color={"blue"}
                border={"dashed"}
                ref={transformRef}
                className={"absolute"}
            >
                {transitionRefs.map(([ref, key]) => (
                    <div key={key} ref={ref}>
                        <div
                            ref={hostRef}
                            className={"w-full h-full"}
                            data-image-id={image.getId()}
                            data-image-backend={image.config.backend ?? undefined}
                        />
                    </div>
                ))}
            </Inspect.mDiv>
        </Inspect.Div>
    );
}
