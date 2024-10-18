import {GameState} from "@player/gameState";
import {Text as GameText} from "@core/elements/text";
import React from "react";
import {TransformersMap, TransformHandler} from "@core/elements/transform/transform";
import {SpanElementProp} from "@core/elements/transition/type";
import {m} from "framer-motion";
import {deepMerge} from "@lib/util/data";
import Isolated from "@player/lib/isolated";
import {DisplayableChildProps} from "@player/elements/displayable/type";
import Displayable from "@player/elements/displayable/Displayable";

export default function Text({state, text}: Readonly<{
    state: GameState;
    text: GameText;
}>) {
    const transformOverwrites: {
        [K in keyof TransformersMap]?: TransformHandler<TransformersMap[K]>
    } = {
        "scale": (_) => {
            return {
                width: "fit-content",
            };
        }
    };

    return (
        <Displayable
            displayable={{
                element: text,
                skipTransform: state.game.config.elements.text.allowSkipTransform,
                skipTransition: state.game.config.elements.text.allowSkipTransition,
                transformOverwrites,
            }}
            child={(props) => (
                <DisplayableText
                    {...props}
                    text={text}
                />
            )}
            state={state}
        />
    );
}

function DisplayableText(
    {
        transformRef,
        transformProps,
        transition,
        state,
        text,
    }: Readonly<DisplayableChildProps & {
        text: GameText;
    }>
) {
    const defaultProps: SpanElementProp = {
        style: {
            width: "fit-content",
            ...(state.game.config.app.debug ? {
                border: "1px solid red",
            } : {}),
        },
    };

    return (
        <Isolated className={"absolute overflow-hidden pointer-events-none"}>
            <m.div
                layout
                ref={transformRef}
                className={"absolute"}
                {...(deepMerge<any>({
                    style: {
                        opacity: 0,
                    }
                }, transformProps, {
                    style: {
                        width: "fit-content",
                    }
                }))}
            >
                {transition ? (function () {
                    return transition.toElementProps().map((elementProps, index) => {
                        const mergedProps =
                            deepMerge(defaultProps, transformProps, elementProps);
                        return (
                            <m.span
                                key={index}
                                layout
                                {...mergedProps}
                            >
                                <span>{text.state.text}</span>
                            </m.span>
                        );
                    });
                })() : (
                    <m.div
                        alt={"image"}
                        key={"last"}
                        {...deepMerge<any>(defaultProps, {
                            style: {
                                width: "fit-content",
                            }
                        })}
                        layout
                    >
                        <span>{text.state.text}</span>
                    </m.div>
                )}
            </m.div>
        </Isolated>
    );
}
