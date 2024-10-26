import {GameState} from "@player/gameState";
import {Text as GameText} from "@core/elements/text";
import React from "react";
import {Transform, TransformersMap, TransformHandler} from "@core/elements/transform/transform";
import {SpanElementProp} from "@core/elements/transition/type";
import {m} from "framer-motion";
import {deepMerge} from "@lib/util/data";
import {DisplayableChildProps} from "@player/elements/displayable/type";
import Displayable from "@player/elements/displayable/Displayable";
import clsx from "clsx";
import {TransformDefinitions} from "@core/elements/transform/type";

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
        },
        "transform": (props: TransformDefinitions.Types) => {
            return {
                transform: Transform.propToCSSTransform(state, props, {
                    translate: [
                        text.config.alignX === "left" ? "0%"
                            : (text.config.alignX === "right" ? "-100%" : void 0),
                        text.config.alignY === "top" ? "100%"
                            : (text.config.alignY === "bottom" ? "0%" : void 0),
                    ],
                }),
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
            whiteSpace: "nowrap",
        },
    };

    const spanClassName = clsx(text.config.className);

    return (
        <div className={"absolute overflow-hidden pointer-events-none"}>
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
                {transition ? (function (): React.JSX.Element[] {
                    return transition.toElementProps().map((elementProps, index) => {
                        const mergedProps =
                            deepMerge(defaultProps, transformProps, elementProps);
                        return (
                            <m.span
                                key={index}
                                layout
                                {...mergedProps}
                                className={spanClassName}
                            >
                                <span>{text.state.text}</span>
                            </m.span>
                        );
                    });
                })() : (
                    <m.div
                        key={"last"}
                        {...deepMerge<any>(defaultProps, {
                            style: {
                                width: "fit-content",
                            }
                        })}
                        layout
                    >
                        <span
                            className={spanClassName}
                        >{text.state.text}</span>
                    </m.div>
                )}
            </m.div>
        </div>
    );
}
