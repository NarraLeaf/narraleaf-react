import {GameState} from "@player/gameState";
import {Text as GameText} from "@core/elements/text";
import React, {useEffect, useRef, useState} from "react";
import {Transform} from "@core/elements/transform/transform";
import {CSSElementProp, SpanElementProp} from "@core/elements/transition/type";
import type {DOMKeyframesDefinition} from "framer-motion";
import {m} from "framer-motion";
import {deepMerge} from "@lib/util/data";
import Isolated from "@player/lib/isolated";

export default function Text({state, text}: Readonly<{
    state: GameState;
    text: GameText;
}>) {
    const scope = useRef<HTMLDivElement | null>(null);
    const [transform, setTransform] =
        useState<Transform<any> | null>(null);
    const [transformProps, setTransformProps] =
        useState<CSSElementProp<DOMKeyframesDefinition>>({style: {}});
    const game = state.game;

    useEffect(() => {
        /**
         * Listen to text events
         */
        const imageEventToken = text.events.onEvents([...[
            GameText.EventTypes["event:text.show"],
            GameText.EventTypes["event:text.hide"],
            GameText.EventTypes["event:text.applyTransform"]
        ].map((type) => {
            return {
                type,
                listener: text.events.on(type, async (transform) => {
                    if (!scope.current) {
                        throw new Error("scope not ready");
                    }

                    assignTo(transform.propToCSS(state, text.state));

                    setTransform(transform);

                    state.logger.debug("transform", transform, transform.propToCSS(state, text.state));
                    await transform.animate({scope, target: text}, state, (after) => {
                        text.state = deepMerge(text.state, after);
                        setTransformProps({
                            style: transform.propToCSS(state, text.state) as any,
                        });

                        setTransform(null);
                        state.logger.debug("transform end", transform, transform.propToCSS(state, text.state), text.state);
                    });
                    return true;
                }),
            };
        }), {
            type: GameText.EventTypes["event:text.init"],
            listener: text.events.on(GameText.EventTypes["event:text.init"], async () => {
                await text.toTransform().animate({scope, target: text}, state, (after) => {
                    text.state = deepMerge(text.state, after);
                    setTransformProps({
                        style: text.toTransform().propToCSS(state, text.state) as any,
                    });
                });
            })
        }]);

        assignTo(text.toTransform().propToCSS(state, text.state));

        return () => {
            imageEventToken.cancel();
        };
    }, []);

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
            Object.assign(scope.current.style, arg0.propToCSS(state, text.state));
        } else {
            Object.assign(scope.current.style, arg0);
        }
    }

    const defaultProps: SpanElementProp = {
        style: {
            ...(game.config.app.debug ? {
                border: "1px solid red",
            } : {})
        },
    };

    return (
        <Isolated className={"absolute overflow-hidden"}>
            <m.div
                layout
                ref={(ref) => (scope.current = ref)}
                className={"absolute"}
                {...(deepMerge<any>({
                    style: {
                        opacity: 0,
                    }
                }, transformProps))}
            >
                {(
                    <m.span
                        alt={"image"}
                        key={"last"}
                        {...deepMerge<any>(defaultProps, {})}
                        layout
                    />
                )}
            </m.div>
        </Isolated>
    );
}
