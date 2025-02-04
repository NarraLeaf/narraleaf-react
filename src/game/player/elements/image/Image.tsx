import {Image as GameImage} from "@core/elements/displayable/image";
import React, {useRef, useState} from "react";
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
import {ExposedStateType} from "@player/type";

export type ImageEvents = {
    "event:image.onLoad": [];
};

/**@internal */
export default function Image(
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
    const {
        transformRef,
        transitionRefs,
        isTransforming,
        initDisplayable,
        applyTransition,
        applyTransform,
        deps,
    } = useDisplayable<ImageTransition, HTMLImageElement>({
        element: image,
        state: image.transformState,
        skipTransform: state.game.config.elements.img.allowSkipTransform,
        skipTransition: state.game.config.elements.img.allowSkipTransition,
        transitionsProps: (task) => {
            const currentSrc = task ? task.transition._getCurrentSrc() : image.state.currentSrc;
            return [
                {
                    style: {
                        position: "absolute",
                        transformOrigin: "center",
                        backgroundColor: Utils.isColor(currentSrc) ? Utils.colorToString(currentSrc) : undefined,
                        transform: "none",
                        top: "auto",
                        left: "auto",
                        right: "auto",
                        bottom: "auto",
                    },
                    src: Utils.isImageSrc(currentSrc) ? Utils.srcToURL(currentSrc) : GameImage.DefaultImagePlaceholder,
                },
                {
                    style: {
                        position: "absolute",
                        transformOrigin: "center",
                        transform: "translate(-50%, -50%)",
                        top: "50%",
                        left: "50%",
                        right: "auto",
                        bottom: "auto",
                        maxWidth: "none",
                        maxHeight: "none",
                    }
                }
            ];
        },
        propOverwrite: (props) => {
            if (props.src) {
                if (!Utils.isDataURI(props.src)
                    && (!cacheManager.has(props.src) && !cacheManager.isPreloading(props.src))
                    && !ignored.current.includes(props.src)
                ) {
                    state.game.getLiveGame().getGameState()?.logger.warn("Image",
                        `Image not preloaded: "${props.src}". `
                        + "\nThis may be caused by complicated image action behavior that cannot be predicted. "
                        + "\nTo fix this issue, you can manually register the image using scene.preloadImage(YourImageSrc). "
                    );
                    ignored.current.push(props.src);
                }
                return {
                    ...props,
                    src: cacheManager.get(props.src) || props.src,
                };
            }
            return props;
        }
    });

    useExposeState<ExposedStateType.image>(image, {
        createWearable: (wearable: GameImage) => {
            setWearables((prev) => [...prev, wearable]);
        },
        initDisplayable,
        applyTransform,
        applyTransition,
        events,
    }, [...deps]);

    function handleWidthChange(width: number, height: number) {
        if (containerRef.current) {
            events.emit("event:image.onLoad");
            Object.assign(containerRef.current.style, {
                width: `${width}px`,
                height: `${height}px`,
            });
        }
    }

    function handleOnLoad() {
        events.emit("event:image.onLoad");
    }

    return (
        <motion.div
            layout={isTransforming}
            ref={transformRef}
            className={"absolute w-max h-max"}
        >
            <div className={"relative h-full w-full"} ref={containerRef}>
                {transitionRefs.map(([ref, key], i) => (
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
};
