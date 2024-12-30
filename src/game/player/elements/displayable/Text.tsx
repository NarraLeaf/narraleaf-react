import {GameState} from "@player/gameState";
import {Text as GameText} from "@core/elements/displayable/text";
import React from "react";
import {Transform} from "@core/elements/transform/transform";
import {CSSProps, ITransition, SpanElementProp} from "@core/elements/transition/type";
import {deepMerge} from "@lib/util/data";
import clsx from "clsx";
import Inspect from "@player/lib/Inspect";
import {useRatio} from "@player/provider/ratio";
import {useDisplayable} from "@player/elements/displayable/Displayable";

/**@internal */
export default function Text({state, text}: Readonly<{
    state: GameState;
    text: GameText;
}>) {
    const {ref, transition} = useDisplayable({
        element: text,
        state: text.transformState,
        skipTransform: state.game.config.elements.text.allowSkipTransform,
        skipTransition: state.game.config.elements.text.allowSkipTransition,
        overwriteDefinition: {
            overwrite: (props) => {
                return {
                    width: "fit-content",
                    transform: Transform.propToCSSTransform(state, props, {
                        translate: [
                            text.config.alignX === "left" ? "0%"
                                : (text.config.alignX === "right" ? "-100%" : void 0),
                            text.config.alignY === "top" ? "100%"
                                : (text.config.alignY === "bottom" ? "0%" : void 0),
                        ],
                    }),
                };
            },
        },
    });

    return (
        <DisplayableText
            ref={ref}
            transition={transition}
            text={text}
            gameState={state}
        />
    );
}

function DisplayableText(
    {
        ref,
        transition,
        text,
        gameState,
    }: Readonly<{
        gameState: GameState;
        ref: React.RefObject<HTMLDivElement | null>;
        transition: ITransition | null;
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
    const transformProps: CSSProps = text.transformState.toStyle(gameState);

    return (
        <Inspect.Div>
            <Inspect.mDiv
                tag={"text.container"}
                color={"green"}
                border={"dashed"}
                layout
                ref={ref}
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
