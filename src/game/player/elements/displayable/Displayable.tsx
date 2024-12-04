import React, {useEffect, useRef, useState} from "react";
import {EventfulDisplayable} from "@core/types";
import {DisplayableChildHandler, StatefulDisplayable} from "@player/elements/displayable/type";
import {ElementProp, ITransition, TransitionEventTypes} from "@core/elements/transition/type";
import {Transform, TransformersMap, TransformHandler} from "@core/elements/transform/transform";
import {GameState} from "@player/gameState";
import {deepMerge} from "@lib/util/data";

export type DisplayableProps = {
    displayable: {
        skipTransition?: boolean;
        skipTransform?: boolean;
        transformOverwrites?: {
            [K in keyof TransformersMap]?: TransformHandler<TransformersMap[K]>
        }
    } & (
        | {
        element: EventfulDisplayable & StatefulDisplayable;
        state?: StatefulDisplayable;
    }
        | {
        element: EventfulDisplayable;
        state: StatefulDisplayable;
    })
    child: DisplayableChildHandler;
    state: GameState;
};

export default function Displayable(
    {
        state: gameState,
        displayable,
        child,
    }: Readonly<DisplayableProps>
) {
    const {
        element,
        state: displayableState = element as EventfulDisplayable & StatefulDisplayable
    } = displayable;
    const scope = useRef<HTMLDivElement | null>(null);
    const [transition, setTransition] =
        useState<null | ITransition>(null);
    const [, setTransitionProps] =
        useState<ElementProp[]>([]);
    const [transform, setTransform] =
        useState<null | Transform>(null);
    const [transformProps, setTransformProps] =
        useState<ElementProp>({});

    useEffect(() => {
        const APPLY_TRANSITION = "event:displayable.applyTransition" as const;
        const APPLY_TRANSFORM = "event:displayable.applyTransform" as const;
        const INIT = "event:displayable.init" as const;

        const sceneEventTokens = element.events.onEvents([
            {
                type: APPLY_TRANSITION,
                listener: element.events.on(APPLY_TRANSITION, applyTransition)
            },
            {
                type: APPLY_TRANSFORM,
                listener: element.events.on(APPLY_TRANSFORM, applyTransform)
            },
            {
                type: INIT,
                listener: element.events.on(INIT, async () => {
                    const transform = element.toDisplayableTransform();

                    gameState.logger.debug("init transform", transform);
                    await transform.animate({
                        scope,
                        target: displayableState,
                        overwrites: displayable.transformOverwrites
                    }, gameState, (after) => {
                        displayableState.state = deepMerge(displayableState.state, after);
                    });
                })
            }
        ]);

        return () => {
            sceneEventTokens.cancel();
        };
    }, []);

    useEffect(() => {
        if (!scope.current) {
            throw new Error(`Scope not ready. Using element: ${element.constructor.name}`);
        }
    }, []);

    useEffect(() => {
        const gameEvents = gameState.events.onEvents([
            {
                type: GameState.EventTypes["event:state.player.skip"],
                listener: gameState.events.on(GameState.EventTypes["event:state.player.skip"], () => {
                    if (displayable.skipTransform && transform && transform.getControl()) {
                        transform.getControl()!.complete();
                        transform.setControl(null);

                        gameState.logger.debug("transform skip");
                    }
                    if (displayable.skipTransition && transition && transition.controller) {
                        transition.controller.complete();
                        setTransition(null);

                        gameState.logger.debug("transition skip");
                    }
                }),
            }
        ]);

        return () => {
            gameEvents.cancel();
        };
    }, [transition, transform]);

    function assignStyle(arg0: Transform | Record<string, any>) {
        if (transform && transform.getControl()) {
            gameState.logger.warn("Displayable Animation", "processing transform not completed");
            transform.getControl()!.complete();
            transform.setControl(null);
        }
        if (!scope.current) {
            throw new Error("scope not ready");
        }
        if (arg0 instanceof Transform) {
            Object.assign(scope.current.style, arg0.propToCSS(gameState, displayableState.state, displayable.transformOverwrites));
        } else {
            Object.assign(scope.current.style, arg0);
        }
    }

    function applyTransition(newTransition: ITransition) {
        setTransition(newTransition);
        if (!newTransition) {
            gameState.logger.warn("transition not set");
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            const eventToken = newTransition.events.onEvents([
                {
                    type: TransitionEventTypes.update,
                    listener: newTransition.events.on(TransitionEventTypes.update, (progress) => {
                        setTransitionProps(progress);
                    }),
                },
                {
                    type: TransitionEventTypes.end,
                    listener: newTransition.events.on(TransitionEventTypes.end, () => {
                        setTransition(null);

                        gameState.logger.debug("transition end", newTransition);
                    })
                },
                {
                    type: TransitionEventTypes.start,
                    listener: newTransition.events.on(TransitionEventTypes.start, () => {
                        gameState.logger.debug("transition start", newTransition);
                    })
                }
            ]);
            newTransition.start(() => {
                eventToken.cancel();
                resolve();
            });
        });
    }

    async function applyTransform(newTransform: Transform) {
        assignStyle(newTransform.propToCSS(gameState, displayableState.state, displayable.transformOverwrites));

        setTransform(newTransform);
        await newTransform.animate({
            scope,
            target: displayableState,
            overwrites: displayable.transformOverwrites
        }, gameState, (after) => {

            displayableState.state = deepMerge(displayableState.state, after);

            setTransformProps({
                style: newTransform.propToCSS(gameState, displayableState.state, displayable.transformOverwrites) as any,
            });

            setTransform(null);
        });
    }

    return (
        <>{
            child({
                transformRef: scope,
                transition,
                transform,
                transformProps,
                state: gameState
            })
        }</>
    );
}

