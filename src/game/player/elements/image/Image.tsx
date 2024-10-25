import {Image as GameImage} from "@core/elements/image";
import React, {useEffect, useState} from "react";
import {m} from "framer-motion";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";
import {Utils} from "@core/common/core";
import {ImgElementProp} from "@core/elements/transition/type";
import {useGame} from "@player/provider/game-state";
import {DisplayableChildProps} from "@player/elements/displayable/type";
import Displayable from "@player/elements/displayable/Displayable";
import {useRatio} from "@player/provider/ratio";

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

    const defaultProps: ImgElementProp = {
        src: Utils.staticImageDataToSrc(image.state.src),
        style: {
            ...(state.game.config.app.debug ? {
                border: "1px solid red",
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
                transform: `translate(-50%, -50%) scale(${ratio.state.scale})`,
            }
        }
    ];

    return (
        <div>
            <m.div
                layout
                ref={transformRef}
                className={"absolute"}
                {...(deepMerge<any>({
                    style: {
                        opacity: 0,
                        border: state.game.config.app.debug ? "1px dashed yellow" : undefined,
                    }
                }, transformProps, {
                    style: {
                        display: "inline-block",
                    }
                }))}
            >
                {transition ? (<>
                    {transition.toElementProps().map((elementProps, index, arr) => {
                        const mergedProps =
                            deepMerge<ImgElementProp>(defaultProps, elementProps, {
                                style: {
                                    transform: `scale(${ratio.state.scale})`,
                                }
                            }, transitionProps[index] || {}) as any;
                        return (
                            <m.img
                                className={"absolute"}
                                key={index === (arr.length - 1) ? "last" : index}
                                alt={mergedProps.alt}
                                {...mergedProps}
                                onLoad={handleLoad}
                                layout
                            />
                        );
                    })}
                </>) : (
                    <m.img
                        alt={"image"}
                        key={"last"}
                        {...deepMerge<any>(defaultProps, {
                            style: {
                                transform: `scale(${ratio.state.scale})`,
                            }
                        })}
                        onLoad={handleLoad}
                        layout
                    />
                )}
                {(() => {
                    image.events.emit(GameImage.EventTypes["event:image.flush"]);
                    return null;
                })()}
            </m.div>
        </div>
    );
}

