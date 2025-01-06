import {Image as GameImage} from "@core/elements/displayable/image";
import React, {useEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import Inspect from "@player/lib/Inspect";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import {useRatio} from "@player/provider/ratio";
import clsx from "clsx";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {Utils} from "@core/common/Utils";

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
    const {ref: transformRef, transitionProps} = useDisplayable<HTMLImageElement>({
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
        transitionProp: {
            src: GameImage.getSrcURL(image) || GameImage.DefaultImagePlaceholder,
            style: {
                ...(state.game.config.app.debug ? {
                    outline: "1px solid red",
                } : {}),
                transformOrigin: "center",
            },
        },
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
            {transitionProps.map((elementProps, index) => (
                <AspectScaleImage
                    key={index}
                    props={{
                        className: "absolute",
                        style: {
                            display: "block",
                            position: "unset",
                        },
                        ...elementProps,
                    }}
                    id={elementProps.src}
                    ref={index === 0 ? ref : undefined}
                    onWidthChange={handleWidthChange}
                    autoFit={image.config.autoFit}
                />
            ))}
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
