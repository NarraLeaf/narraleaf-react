import {Image as GameImage} from "@core/elements/image";
import React, {useEffect, useState} from "react";
import {DOMKeyframesDefinition, useAnimate} from "framer-motion";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";
import {Transform} from "@core/elements/transform/transform";
import {Utils} from "@core/common/core";
import {
    CSSElementProp,
    ImgElementProp,
    ITransition,
    TransitionEventTypes
} from "@core/elements/transition/type";
import Isolated from "@player/lib/isolated";

// @todo: 增加无障碍支持

export default function Image({
                                  image,
                                  state,
                                  onAnimationEnd
                              }: Readonly<{
    image: GameImage;
    state: GameState;
    onAnimationEnd?: () => any;
}>) {
    const [scope, animate] = useAnimate();
    const [transform, setTransform] =
        useState<Transform<any> | null>(null);
    const [transformProps, setTransformProps] =
        useState<CSSElementProp<DOMKeyframesDefinition>>({style: {}});
    const [transition, setTransition] =
        useState<null | ITransition>(null);
    const [transitionProps, setTransitionProps] =
        useState<ImgElementProp[]>([]);

    useEffect(() => {
        image.setScope(scope);

        image.events.emit(GameImage.EventTypes["event:image.mount"]);

        const imageEventToken = image.events.onEvents([...[
            GameImage.EventTypes["event:image.show"],
            GameImage.EventTypes["event:image.hide"],
            GameImage.EventTypes["event:image.applyTransform"]
        ].map((type) => {
            return {
                type,
                listener: image.events.on(type, async (transform) => {
                    assignTo(transform.propToCSS(state, image.state));

                    setTransform(transform);
                    await transform.animate({scope, animate}, state, image.state, (after) => {
                        image.state = deepMerge(image.state, after);
                        setTransformProps({
                            style: transform.propToCSS(state, image.state) as any,
                        });

                        if (onAnimationEnd) {
                            onAnimationEnd();
                        }

                        setTransform(null);
                    });
                    return true;
                }),
            };
        }), {
            type: GameImage.EventTypes["event:image.init"],
            listener: image.events.on(GameImage.EventTypes["event:image.init"], async () => {
                await image.toTransform().animate({scope, animate}, state, image.state, (after) => {
                    image.state = deepMerge(image.state, after);
                    setTransformProps({
                        style: image.toTransform().propToCSS(state, image.state) as any,
                    });
                });
            })
        }]);

        assignTo(image.toTransform().propToCSS(state, image.state));

        image.events.emit(GameImage.EventTypes["event:image.ready"], scope);

        return () => {
            imageEventToken.cancel();
            image.events.emit(GameImage.EventTypes["event:image.unmount"]);
        };
    }, []);

    useEffect(() => {
        const imageEventToken = image.events.onEvents([
            {
                type: GameImage.EventTypes["event:image.setTransition"],
                listener: image.events.on(GameImage.EventTypes["event:image.setTransition"], (transition) => {
                    setTransition(transition);
                })
            }
        ]);

        const transitionEventTokens = transition ? transition.events.onEvents([
            {
                type: TransitionEventTypes.update,
                listener: transition.events.on(TransitionEventTypes.update, (progress) => {
                    setTransitionProps(progress);
                })
            },
            {
                type: TransitionEventTypes.end,
                listener: transition.events.on(TransitionEventTypes.end, () => {
                    setTransition(null);
                })
            }
        ]) : null;

        return () => {
            imageEventToken.cancel();
            transitionEventTokens?.cancel?.();
        };
    }, [transition, image]);

    function assignTo(arg0: Transform | Record<string, any>) {
        if (transform && transform.getControl()) {
            console.warn("processing transform not completed");
            transform.getControl()!.complete();
            transform.setControl(null);
        }
        if (!scope.current) {
            throw new Error("scope not ready");
        }
        if (arg0 instanceof Transform) {
            Object.assign(scope.current.style, arg0.propToCSS(state, image.state));
        } else {
            Object.assign(scope.current.style, arg0);
        }
    }

    const defaultProps = {
        className: "absolute",
        src: Utils.staticImageDataToSrc(image.state.src),
        width: image.state.width,
        height: image.state.height,
        style: {
            border: "dashed 5px red",
        }
    };

    return (
        <Isolated className={"absolute overflow-hidden"}>
            {transition ? transition.toElementProps().map((elementProps, index, arr) => {
                const mergedProps =
                    deepMerge<ImgElementProp>(defaultProps, transformProps, elementProps, transitionProps[index] || {});
                return (
                    <img key={index} alt={mergedProps.alt} {...mergedProps}
                         ref={index === (arr.length - 1) ? scope : undefined}/>
                );
            }) : (
                <img ref={scope} alt={"image"} {...deepMerge(defaultProps, transformProps)} />
            )}
        </Isolated>
    );
};