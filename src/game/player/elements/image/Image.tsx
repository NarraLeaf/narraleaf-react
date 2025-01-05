import {Image as GameImage} from "@core/elements/displayable/image";
import React, {useEffect, useRef, useState} from "react";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";
import {CSSProps, ImgElementProp} from "@core/elements/transition/type";
import Inspect from "@player/lib/Inspect";
import AspectScaleImage from "@player/elements/image/AspectScaleImage";
import {useRatio} from "@player/provider/ratio";
import clsx from "clsx";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {Utils} from "@core/common/Utils";
import {useFlush} from "@player/lib/flush";

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
    const [, setTransformStyle] = useState<CSSProps>({
        ...(Utils.isColor(image.state.currentSrc) ? {
            width: "100%",
            height: "100%",
        } : {}),
    });
    const ref = useRef<HTMLImageElement>(null);
    const {ref: transformRef, transition, flushDeps} = useDisplayable({
        element: image,
        state: image.transformState,
        skipTransform: state.game.config.elements.img.allowSkipTransform,
        skipTransition: state.game.config.elements.img.allowSkipTransition,
        onTransform: () => {
            setTransformStyle((prev) => {
                const style = Object.assign({}, prev, image.transformState.toStyle(state));
                Object.assign(transformRef.current!.style, style);
                return style;
            });
            state.logger.debug("Image", "Transform applied", transformRef.current, image.transformState.toStyle(state));
            flush();
        },
    });
    const [flush] = useFlush(flushDeps);

    const defaultProps: ImgElementProp = {
        src: GameImage.getSrcURL(image) || GameImage.DefaultImagePlaceholder,
        style: {
            ...(state.game.config.app.debug ? {
                outline: "1px solid red",
            } : {}),
            transformOrigin: "center",
        },
    };

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

    useEffect(() => {
        handleWidthChange();
        return ratio.onUpdate(handleWidthChange);
    }, [ref, transformRef]);

    function handleWidthChange() {
        if (transformRef.current && ref.current) {
            Object.assign(transformRef.current.style, {
                width: `${ref.current.naturalWidth * ratio.state.scale}px`,
                height: `${ref.current.naturalHeight * ratio.state.scale}px`,
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
            {(<>
                {(transition ? transition.toElementProps() : [{}]).map((elementProps, index) => {
                    const mergedProps =
                        deepMerge<ImgElementProp>(defaultProps, elementProps);
                    return (
                        <AspectScaleImage
                            key={index}
                            props={{
                                className: "absolute",
                                style: {
                                    display: "block",
                                    position: "unset",
                                },
                                ...mergedProps,
                            }}
                            id={mergedProps.src}
                            ref={index === 0 ? ref : undefined}
                            onWidthChange={handleWidthChange}
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
    );
};
