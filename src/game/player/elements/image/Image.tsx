import {Image as GameImage} from "@core/elements/displayable/image";
import React, {useEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import Inspect from "@player/lib/Inspect";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import {useRatio} from "@player/provider/ratio";
import clsx from "clsx";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {Utils} from "@core/common/Utils";
import {ITransition} from "@lib/game/nlcore/elements/transition/type";
import {Legacy_useTransition} from "@player/lib/useTransition";
import {useGame} from "@player/provider/game-state";
import {deepMerge} from "@lib/util/data";

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
    const {ref: transformRef, transition} = useDisplayable({
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
            <ImageTransition
                transition={transition}
                ref={ref}
                onWidthChange={handleWidthChange}
                image={image}
            />
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

function ImageTransition(
    {
        transition,
        ref,
        onWidthChange,
        image,
    }: {
        transition: ITransition | undefined,
        ref: React.RefObject<HTMLImageElement | null>,
        onWidthChange: () => void,
        image: GameImage;
    }
) {
    const {game} = useGame();
    const [transitionProps] = Legacy_useTransition<HTMLImageElement>({
        transition,
        props: {
            src: GameImage.getSrcURL(image) || GameImage.DefaultImagePlaceholder,
            style: {
                ...(game.config.app.debug ? {
                    outline: "1px solid red",
                } : {}),
                transformOrigin: "center",
            },
        }
    });

    const elementStyles = [
        {
            style: {
                position: "absolute",
            }
        },
        {
            style: {
                maxWidth: "none",
                maxHeight: "none",
                transform: "translate(-50%, -50%)",
                top: "50%",
                left: "50%",
                position: "absolute",
            }
        }
    ];

    return (
        <>
            <div className={"relative h-full w-full"}>
                {transitionProps.map((elementProps, index) => {
                    return <AspectScaleImage
                        key={index}
                        props={deepMerge(elementProps, elementStyles[index] || elementStyles[elementStyles.length - 1])}
                        id={elementProps.src as any}
                        ref={index === 0 ? ref : undefined}
                        onWidthChange={onWidthChange}
                        autoFit={image.config.autoFit}
                    />;
                })}
            </div>
        </>
    );
}
