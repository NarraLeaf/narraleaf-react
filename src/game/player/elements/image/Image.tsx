import {Image as GameImage} from "@core/elements/displayable/image";
import React, {useEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";
import {ImgElementProp} from "@core/elements/transition/type";
import {DisplayableChildProps} from "@player/elements/displayable/type";
import Displayable from "@player/elements/displayable/Displayable";
import Inspect from "@player/lib/Inspect";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import {useRatio} from "@player/provider/ratio";
import clsx from "clsx";

/**@internal */
export default function Image(
    {
        image,
        state,
    }: Readonly<{
        image: GameImage;
        state: GameState;
    }>) {
    /**
     * Slow load warning
     */
    const handleLoad = () => {
    };

    return (
        <Displayable
            displayable={{
                element: image,
                skipTransition: state.game.config.elements.img.allowSkipTransition,
                skipTransform: state.game.config.elements.img.allowSkipTransform,
                transformOverwrites: {},
            }}
            child={(props) => (
                <DisplayableImage
                    {...props}
                    image={image}
                    handleLoad={handleLoad}
                />
            )} state={state}
        />
    );
};

/**@internal */
function DisplayableImage(
    {
        transition,
        transformProps,
        transformRef,
        state,
        image,
        handleLoad
    }: Readonly<DisplayableChildProps & {
        image: GameImage;
        handleLoad: () => void;
    }>) {
    const {ratio} = useRatio();
    const ref = useRef<HTMLImageElement>(null);
    const [wearables, setWearables] = useState<GameImage[]>([]);

    const defaultProps: ImgElementProp = {
        src: GameImage.getSrc(image.state),
        style: {
            ...(state.game.config.app.debug ? {
                outline: "1px solid red",
            } : {}),
            transformOrigin: "center",
        },
    };

    const transitionProps: ImgElementProp[] = [
        {
            style: {
                display: "block",
                position: "unset"
            }
        },
        {
            style: {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                maxWidth: "none"
            }
        }
    ];

    useEffect(() => {
        const token = image.events.onEvents([
            {
                type: GameImage.EventTypes["event:wearable.create"],
                listener: image.events.on(GameImage.EventTypes["event:wearable.create"], (wearable: GameImage) => {
                    setWearables((prev) => [...prev, wearable]);
                })
            }
        ]);
        return () => {
            token.cancel();
        };
    }, []);

    return (
        <div>
            <Inspect.mDiv
                tag={"image.aspectScaleContainer"}
                color={"green"}
                border={"dashed"}
                layout
                Ref={transformRef}
                className={"absolute"}
                {...(deepMerge<any>({
                    style: {
                        opacity: 0,
                    }
                }, transformProps, {
                    style: {
                        display: "inline-block",
                        width: ref.current ? `${ref.current.naturalWidth * ratio.state.scale}px` : "auto",
                        height: ref.current ? `${ref.current.naturalHeight * ratio.state.scale}px` : "auto",
                    }
                }))}
            >
                {(<>
                    {(transition ? transition.toElementProps() : [{}]).map((elementProps, index) => {
                        const mergedProps =
                            deepMerge<ImgElementProp>(defaultProps, elementProps, transitionProps[index] || {});
                        return (
                            <AspectScaleImage
                                key={index}
                                props={{
                                    className: "absolute",
                                    ...mergedProps,
                                }}
                                id={mergedProps.src}
                                onLoad={handleLoad}
                                Ref={index === 0 ? ref : undefined}
                            />
                        );
                    })}
                </>)}
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
        </div>
    );
}

