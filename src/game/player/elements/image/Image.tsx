import {Image as GameImage} from "@core/elements/image";
import React, {useEffect, useRef, useState} from "react";
import type {DOMKeyframesDefinition} from "framer-motion";
import {m} from "framer-motion";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";
import {Transform} from "@core/elements/transform/transform";
import {Utils} from "@core/common/core";
import {CSSElementProp, ImgElementProp, ITransition, TransitionEventTypes} from "@core/elements/transition/type";
import Isolated from "@player/lib/isolated";
import {useGame} from "@player/provider/game-state";

export default function Image({
                                  image,
                                  state,
                                  onAnimationEnd
                              }: Readonly<{
    image: GameImage;
    state: GameState;
    onAnimationEnd?: () => any;
}>) {
    const scope = useRef<HTMLImageElement | null>(null);
    const [transform, setTransform] =
        useState<Transform<any> | null>(null);
    const [transformProps, setTransformProps] =
        useState<CSSElementProp<DOMKeyframesDefinition>>({style: {}});
    const [transition, setTransition] =
        useState<null | ITransition>(null);
    const [, setTransitionProps] =
        useState<ImgElementProp[]>([]);
    const [startTime, setStartTime] = useState<number>(0);
    const {game} = useGame();

    useEffect(() => {
        image.setScope(scope);

        image.events.emit(GameImage.EventTypes["event:image.mount"]);

        /**
         * Listen to image events
         */
        const imageEventToken = image.events.onEvents([...[
            GameImage.EventTypes["event:image.show"],
            GameImage.EventTypes["event:image.hide"],
            GameImage.EventTypes["event:image.applyTransform"]
        ].map((type) => {
            return {
                type,
                listener: image.events.on(type, async (transform) => {
                    if (!scope.current) {
                        throw new Error("scope not ready");
                    }

                    assignTo(transform.propToCSS(state, image.state));

                    setTransform(transform);

                    state.logger.debug("transform", transform, transform.propToCSS(state, image.state));
                    await transform.animate({scope}, state, image.state, (after) => {
                        state.logger.debug("transform start", transform, transform.propToCSS(state, image.state));

                        image.state = deepMerge(image.state, after);
                        setTransformProps({
                            style: transform.propToCSS(state, image.state) as any,
                        });

                        setTransform(null);
                        state.logger.debug("transform end", transform, transform.propToCSS(state, image.state));

                        if (onAnimationEnd) {
                            onAnimationEnd();
                        }
                    });
                    return true;
                }),
            };
        }), {
            type: GameImage.EventTypes["event:image.init"],
            listener: image.events.on(GameImage.EventTypes["event:image.init"], async () => {
                await image.toTransform().animate({scope}, state, image.state, (after) => {
                    image.state = deepMerge(image.state, after);
                    setTransformProps({
                        style: image.toTransform().propToCSS(state, image.state) as any,
                    });
                });
            })
        }]);

        const imageTransitionEventToken = image.events.onEvents([
            {
                type: GameImage.EventTypes["event:image.applyTransition"],
                listener: image.events.on(GameImage.EventTypes["event:image.applyTransition"], (t) => {
                    setTransition(t);
                    if (!t) {
                        state.logger.warn("transition not set");
                        return Promise.resolve();
                    }
                    return new Promise<void>(resolve => {
                        const eventToken = t.events.onEvents([
                            {
                                type: TransitionEventTypes.update,
                                listener: t.events.on(TransitionEventTypes.update, (progress) => {
                                    setTransitionProps(progress);
                                }),
                            },
                            {
                                type: TransitionEventTypes.end,
                                listener: t.events.on(TransitionEventTypes.end, () => {
                                    setTransition(null);

                                    state.logger.debug("image transition end", t);
                                })
                            },
                            {
                                type: TransitionEventTypes.start,
                                listener: t.events.on(TransitionEventTypes.start, () => {
                                    state.logger.debug("image transition start", t);
                                })
                            }
                        ]);
                        t.start(() => {
                            eventToken.cancel();
                            resolve();
                        });
                    });
                })
            },
            {
                type: GameImage.EventTypes["event:image.flushComponent"],
                listener: image.events.on(GameImage.EventTypes["event:image.flushComponent"], async () => {
                    state.stage.update();
                    await new Promise<void>(resolve => {
                        // It is hard to explain why this is needed, but it is needed
                        // react does not flush between some microtasks
                        // so we need to wait for the next microtask
                        setTimeout(() => {
                            resolve();
                        }, 10);
                    });
                    return true;
                })
            }
        ]);

        assignTo(image.toTransform().propToCSS(state, image.state));

        image.events.emit(GameImage.EventTypes["event:image.ready"], scope);

        return () => {
            imageEventToken.cancel();
            imageTransitionEventToken.cancel();
            image.events.emit(GameImage.EventTypes["event:image.unmount"]);
        };
    }, []);

    useEffect(() => {
        setStartTime(performance.now());
    }, []);

    /**
     * Listen to player events
     */
    useEffect(() => {
        const gameEvents = state.events.onEvents([
            {
                type: GameState.EventTypes["event:state.player.skip"],
                listener: state.events.on(GameState.EventTypes["event:state.player.skip"], () => {
                    if (transform && transform.getControl()) {
                        transform.getControl()!.complete();
                        transform.setControl(null);
                        state.logger.debug("transform skip");
                    }
                    if (transition && transition.controller) {
                        transition.controller.complete();
                        setTransition(null);
                        state.logger.debug("transition skip");
                    }
                }),
            }
        ]);

        return () => {
            gameEvents.cancel();
        };
    }, [transition, transform]);

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

    const defaultProps: ImgElementProp = {
        className: "absolute",
        src: Utils.staticImageDataToSrc(image.state.src),
        style: {
            opacity: 0,
            ...(game.config.app.debug ? {
                border: "1px solid red",
            } : {})
        },
    };

    return (
        <Isolated className={"absolute overflow-hidden"}>
            {transition ? transition.toElementProps().map((elementProps, index, arr) => {
                const mergedProps =
                    deepMerge<ImgElementProp>(defaultProps, transformProps, elementProps) as any;
                return (
                    <m.img
                        key={index === (arr.length - 1) ? "last" : index}
                        alt={mergedProps.alt}
                        {...mergedProps}
                        ref={index === (arr.length - 1) ? scope : undefined}
                        onLoad={handleLoad}
                        layout
                    />
                );
            }) : (
                <m.img
                    ref={scope}
                    alt={"image"}
                    key={"last"}
                    {...deepMerge(defaultProps, transformProps)}
                    onLoad={handleLoad}
                />
            )}
            {(() => {
                image.events.emit(GameImage.EventTypes["event:image.flush"]);
                return null;
            })()}
        </Isolated>
    );
};