import {GameState} from "@player/gameState";
import {Text as GameText} from "@core/elements/displayable/text";
import React from "react";
import {Transform, TransformersMap, TransformHandler} from "@core/elements/transform/transform";
import {SpanElementProp} from "@core/elements/transition/type";
import {deepMerge} from "@lib/util/data";
import {DisplayableChildProps} from "@player/elements/displayable/type";
import Displayable from "@player/elements/displayable/Displayable";
import clsx from "clsx";
import {TransformDefinitions} from "@core/elements/transform/type";
import Inspect from "@player/lib/Inspect";
import {useRatio} from "@player/provider/ratio";

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
        text,
    }: Readonly<DisplayableChildProps & {
        text: GameText;
    }>
) {
    const {ratio} = useRatio();
    const defaultProps: SpanElementProp = {
        style: {
            width: "fit-content",
            whiteSpace: "nowrap",
            fontSize: text.state.fontSize,
        },
    };
    const transitionProps: SpanElementProp[] = [
        {}
    ];

    const spanClassName = clsx(text.config.className);

    return (
        <Inspect.Div>
            <Inspect.mDiv
                tag={"text.container"}
                color={"green"}
                border={"dashed"}
                layout
                Ref={transformRef}
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
                            deepMerge<SpanElementProp>(defaultProps, elementProps, ({
                                style: {
                                    transform: `scale(${ratio.state.scale})`,
                                    transformOrigin: `${text.config.alignX} ${text.config.alignY}`,
                                }
                            } satisfies SpanElementProp), transitionProps[index] || {}) as any;
                        return (
                            <Inspect.Span
                                tag={"text.transition." + index}
                                key={index}
                                {...mergedProps}
                                className={spanClassName}
                            >
                                <span>{text.state.text}</span>
                            </Inspect.Span>
                        );
                    });
                })() : (
                    <Inspect.Div
                        tag={"text.transition.last"}
                        color={"green"}
                        border={"dashed"}
                        key={"last"}
                        {...deepMerge<any>(defaultProps, {
                            style: {
                                width: "fit-content",
                                transform: `scale(${ratio.state.scale})`,
                                transformOrigin: `${text.config.alignX} ${text.config.alignY}`,
                            }
                        })}
                    >
                        <Inspect.Span
                            className={spanClassName}
                        >{text.state.text}</Inspect.Span>
                    </Inspect.Div>
                )}
            </Inspect.mDiv>
        </Inspect.Div>
    );
}
