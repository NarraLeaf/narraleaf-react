import {Image as GameImage} from "@core/elements/displayable/image";
import React, {useEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import Inspect from "@player/lib/Inspect";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import {useRatio} from "@player/provider/ratio";
import clsx from "clsx";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {Utils} from "@core/common/Utils";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {usePreloaded} from "@player/provider/preloaded";

/**@internal */
export default function Image(
    {
        image,
        state,
    }: Readonly<{
        image: GameImage;
        state: GameState;
    }>) {
    const {ratio} = useRatio();
    const [wearables, setWearables] = useState<GameImage[]>([]);
    const ref = useRef<HTMLImageElement>(null);
    const {cacheManager} = usePreloaded();
    const ignored = useRef<string[]>([]);
    const {transformRef, transitionRefs} = useDisplayable<ImageTransition, HTMLImageElement>({
        element: image,
        state: image.transformState,
        skipTransform: state.game.config.elements.img.allowSkipTransform,
        skipTransition: state.game.config.elements.img.allowSkipTransition,
        transformStyle: {
            ...(Utils.isColor(image.state.currentSrc) ? {
                width: "100%",
                height: "100%",
            } : {}),
        },
        transitionsProps: [
            {
                style: {
                    position: "absolute",
                    transformOrigin: "center",
                }
            },
            {
                style: {
                    maxWidth: "none",
                    maxHeight: "none",
                    transform: "translate(-50%, -50%)",
                    transformOrigin: "center",
                    top: "50%",
                    left: "50%",
                    position: "absolute",
                }
            }
        ],
        propOverwrite: (props) => {
            if (props.src) {
                if (!Utils.isDataURI(props.src)
                    && (!cacheManager.has(props.src) && !cacheManager.isPreloading(props.src))
                    && !ignored.current.includes(props.src)
                ) {
                    state.game.getLiveGame().getGameState()?.logger.warn("Image",
                        `Image not preloaded: "${props.src}". `
                        + "\nThis may be caused by complicated image action behavior that cannot be predicted. "
                        + "\nTo fix this issue, you can manually register the image using scene.requestImagePreload(YourImageSrc). "
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

    useEffect(() => {
        return image.events.on(GameImage.EventTypes["event:wearable.create"], (wearable: GameImage) => {
            setWearables((prev) => [...prev, wearable]);
        }).cancel;
    }, []);

    useEffect(() => {
        handleWidthChange();
        return ratio.onUpdate(handleWidthChange);
    }, [ref, transformRef]);

    function handleWidthChange() {
        if (transformRef.current && ref.current) {
            const autoFitFactor = image.config.autoFit ? (state.game.config.player.width / ref.current.naturalWidth) : 1;
            const newWidth = ref.current.naturalWidth * ratio.state.scale * autoFitFactor;
            const newHeight = ref.current.naturalHeight * ratio.state.scale * autoFitFactor;
            Object.assign(transformRef.current.style, {
                width: `${newWidth}px`,
                height: `${newHeight}px`,
            });
        }
    }

    return (
        <Inspect.mDiv
            tag={"image.aspectScaleContainer"}
            color={"green"}
            border={"dashed"}
            layout
            ref={transformRef}
            className={"absolute"}
        >
            <div className={"relative h-full w-full"}>
                {transitionRefs.map((ref, key) => (
                    <AspectScaleImage
                        key={key}
                        ref={ref}
                        autoFit={image.config.autoFit}
                    />
                ))}
            </div>
            <div
                className={clsx("w-full h-full top-0 left-0 absolute")}
            >
                {wearables.map((wearable) => (
                    <div
                        className={clsx("w-full h-full relative")}
                        key={"wearable-" + wearable.getId()}
                    >
                        <Image image={wearable} state={state}/>
                    </div>
                ))}
            </div>
        </Inspect.mDiv>
    );
};
