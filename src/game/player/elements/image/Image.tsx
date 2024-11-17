import {Image as GameImage} from "@core/elements/image";
import React, {useEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";
import {ImgElementProp} from "@core/elements/transition/type";
import {useGame} from "@player/provider/game-state";
import {DisplayableChildProps} from "@player/elements/displayable/type";
import Displayable from "@player/elements/displayable/Displayable";
import Inspect from "@player/lib/Inspect";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import {useRatio} from "@player/provider/ratio";
import clsx from "clsx";

export default function Image({
                                  image,
                                  state,
                              }: Readonly<{
    image: GameImage;
    state: GameState;
}>) {
    const [startTime, setStartTime] = useState<number>(0);
    const {game} = useGame();

    useEffect(() => {
        setStartTime(performance.now());
    }, []);

    /**
     * Slow load warning
     */
    const handleLoad = () => {
        const endTime = performance.now();
        const loadTime = endTime - startTime;
        const threshold = game.config.elements.img.slowLoadThreshold;

        if (loadTime > threshold && game.config.elements.img.slowLoadWarning) {
            state.logger.warn(
                "NarraLeaf-React",
                `Image took ${loadTime}ms to load, which exceeds the threshold of ${threshold}ms. ` +
                "Consider enable cache for the image, so Preloader can preload it before it's used. " +
                "To disable this warning, set `elements.img.slowLoadWarning` to false in the game config."
            );
        }
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

