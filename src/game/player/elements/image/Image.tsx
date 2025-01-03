import {Image as GameImage} from "@core/elements/displayable/image";
import React, {useEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";
import {CSSProps, DivElementProp, ImgElementProp} from "@core/elements/transition/type";
import Inspect from "@player/lib/Inspect";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import {useRatio} from "@player/provider/ratio";
import clsx from "clsx";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {Utils} from "@core/common/Utils";
import {Color} from "@core/types";

/**@internal */
export default function Image(
    {
        image,
        state,
        props,
        style,
    }: Readonly<{
        image: GameImage;
        state: GameState;
        props?: ImgElementProp;
        style?: DivElementProp;
    }>) {
    const {ratio} = useRatio();
    const [wearables, setWearables] = useState<GameImage[]>([]);
    const ref = useRef<HTMLImageElement>(null);
    const {ref: transformRef, transition} = useDisplayable({
        element: image,
        state: image.transformState,
        skipTransform: state.game.config.elements.img.allowSkipTransform,
        skipTransition: state.game.config.elements.img.allowSkipTransition,
    });

    const defaultProps: ImgElementProp = {
        src: GameImage.getSrcURL(image) || GameImage.DefaultImagePlaceholder,
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

    const transformProps: CSSProps = image.transformState.toStyle(state);

    useEffect(() => {
        return image.events.onEvents([
            {
                type: GameImage.EventTypes["event:wearable.create"],
                listener: image.events.on(GameImage.EventTypes["event:wearable.create"], (wearable: GameImage) => {
                    setWearables((prev) => [...prev, wearable]);
                })
            }
        ]).cancel;
    }, []);

    return (
        <div style={{
            transform: "translate(-50%, 50%)",
            width: "100%",
            height: "100%",
        }}>
            <Inspect.mDiv
                tag={"image.aspectScaleContainer"}
                color={"green"}
                border={"dashed"}
                layout
                ref={transformRef}
                className={"absolute"}
                {...(deepMerge<any>(transformProps, {
                    style: {
                        display: "inline-block",
                        width: ref.current ? `${ref.current.naturalWidth * ratio.state.scale}px` : "auto",
                        height: ref.current ? `${ref.current.naturalHeight * ratio.state.scale}px` : "auto",
                    }
                }, Utils.isColor(image.state.currentSrc) ? {
                    style: {
                        backgroundColor: image.state.currentSrc as Color,
                        width: "100%",
                        height: "100%",
                    }
                } : {}, style || {}))}
            >
                {(<>
                    {(transition ? transition.toElementProps() : [{}]).map((elementProps, index) => {
                        const mergedProps =
                            deepMerge<ImgElementProp>(defaultProps, elementProps, transitionProps[index] || {}, props || {});
                        return (
                            <AspectScaleImage
                                key={index}
                                props={{
                                    className: "absolute",
                                    ...mergedProps,
                                }}
                                id={mergedProps.src}
                                ref={index === 0 ? ref : undefined}
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
};
