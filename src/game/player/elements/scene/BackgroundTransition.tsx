// noinspection SpellCheckingInspection

import React, {useEffect, useRef, useState} from "react";
import {Scene as GameScene} from "@core/elements/scene";
import {ElementProp, ImgElementProp, ITransition, TransitionEventTypes} from "@core/elements/transition/type";
import {deepMerge} from "@lib/util/data";
import Background from "./Background";
import {Transform} from "@core/elements/transform/transform";
import {GameState} from "@player/gameState";
import {useGame} from "@player/provider/game-state";

export default function BackgroundTransition({scene, props, state}: {
    scene: GameScene,
    props: Record<string, any>,
    state: GameState
}) {
    const scope = useRef<HTMLImageElement | null>(null);
    const {game} = useGame();
    const [transition, setTransition] =
        useState<null | ITransition>(null);
    const [, setTransitionProps] =
        useState<ElementProp[]>([]);
    const [transform, setTransform] =
        useState<null | Transform>(null);
    const [transformProps, setTransformProps] =
        useState<ElementProp>({});

    useEffect(() => {
        const sceneEventTokens = scene.events.onEvents([
            {
                type: GameScene.EventTypes["event:scene.applyTransition"],
                listener: scene.events.on(GameScene.EventTypes["event:scene.applyTransition"], (t) => {
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
                                    resolve();

                                    state.logger.debug("transition end", transition);
                                })
                            },
                            {
                                type: TransitionEventTypes.start,
                                listener: t.events.on(TransitionEventTypes.start, () => {
                                    state.logger.debug("transition start", transition);
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
                type: GameScene.EventTypes["event:scene.applyTransform"],
                listener: scene.events.on(GameScene.EventTypes["event:scene.applyTransform"], async (transform) => {
                    assignTo(transform.propToCSS(state, scene.backgroundImageState));

                    setTransform(transform);
                    await transform.animate({scope}, state, scene.backgroundImageState, (after) => {

                        scene.backgroundImageState = deepMerge(scene.backgroundImageState, after);

                        setTransformProps({
                            style: transform.propToCSS(state, scene.backgroundImageState) as any,
                        });

                        setTransform(null);
                    });
                })
            },
            {
                type: GameScene.EventTypes["event:scene.initTransform"],
                listener: scene.events.on(GameScene.EventTypes["event:scene.initTransform"], async (transform) => {
                    state.logger.debug("init transform", transform);
                    await transform.animate({scope}, state, scene.backgroundImageState, (after) => {
                        scene.backgroundImageState = deepMerge(scene.backgroundImageState, after);
                    });
                })
            }
        ]);

        return () => {
            sceneEventTokens.cancel();
        };
    }, [scene]);

    useEffect(() => {
        assignTo(scene.backgroundImageState);
    }, []);

    useEffect(() => {
        const gameEvents = state.events.onEvents([
            {
                type: GameState.EventTypes["event:state.player.skip"],
                listener: state.events.on(GameState.EventTypes["event:state.player.skip"], () => {
                    if (transform && transform.getControl()) {
                        transform.getControl()!.complete();
                        transform.setControl(null);
                    }
                }),
            }
        ]);

        return () => {
            gameEvents.cancel();
        };
    }, [transform]);

    function handleImageOnload() {
        scene.events.emit(GameScene.EventTypes["event:scene.imageLoaded"]);
    }

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
            Object.assign(scope.current.style, arg0.propToCSS(state, scene.backgroundImageState));
        } else {
            Object.assign(scope.current.style, arg0);
        }
    }

    const emptyImage = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    const defaultProps = {
        src: emptyImage,
        style: {
            opacity: 0,
            ...(game.config.app.debug ? {
                border: "1px solid red",
            } : {})
        }
    };

    return (
        <div>
            {
                transition ? (() => {
                    return transition.toElementProps().map((elementProps, index, arr) => {
                        const mergedProps =
                            deepMerge<ImgElementProp>(defaultProps, props, transformProps, elementProps);
                        return (
                            <Background key={index}>
                                <img alt={mergedProps.alt} {...mergedProps} onLoad={handleImageOnload}
                                     src={mergedProps.src || emptyImage}
                                     ref={index === (arr.length - 1) ? scope : undefined} className={"absolute"}/>
                            </Background>
                        );
                    });
                })() : (() => {
                    const mergedProps =
                        deepMerge<ImgElementProp>(defaultProps, props, transformProps);
                    return (
                        <Background>
                            <img alt={mergedProps.alt} {...mergedProps} onLoad={handleImageOnload} ref={scope}
                                 src={mergedProps.src || emptyImage}
                                 className={"absolute"}/>
                        </Background>
                    );
                })()
            }
        </div>
    );
}

