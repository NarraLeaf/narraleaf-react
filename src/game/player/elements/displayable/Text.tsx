import {GameState} from "@player/gameState";
import {Text as GameText} from "@core/elements/displayable/text";
import React from "react";
import {Transform} from "@core/elements/transform/transform";
import {ITransition, SpanElementProp} from "@core/elements/transition/type";
import {deepMerge} from "@lib/util/data";
import Inspect from "@player/lib/Inspect";
import {useRatio} from "@player/provider/ratio";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {useTransition} from "@player/lib/useTransition";

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
        transformStyle: {
            width: "fit-content",
        }
    });

    return (
        <Inspect.Div>
            <Inspect.mDiv
                tag={"text.container"}
                color={"green"}
                border={"dashed"}
                layout
                ref={ref}
                className={"absolute"}
            >
                <TextTransition transition={transition} text={text}/>
            </Inspect.mDiv>
        </Inspect.Div>
    );
}


function TextTransition(
    {
        transition,
        text,
    }: {
        transition: ITransition | undefined,
        text: GameText;
    }
) {
    const {ratio} = useRatio();
    const [transitionProps] = useTransition<HTMLSpanElement>({
        transition,
        props: {
            style: {
                width: "fit-content",
                whiteSpace: "nowrap",
                fontSize: text.state.fontSize,
            },
        }
    });

    return (
        <>
            {transitionProps.map((elementProps, index) => {
                const mergedProps =
                    deepMerge<SpanElementProp>({}, elementProps, ({
                        style: {
                            transform: `scale(${ratio.state.scale})`,
                            transformOrigin: `${text.config.alignX} ${text.config.alignY}`,
                        }
                    } satisfies SpanElementProp)) as any;
                return (
                    <Inspect.Span
                        tag={"text.transition." + index}
                        key={index}
                        {...mergedProps}
                        className={text.config.className}
                    >
                        <span>{text.state.text}</span>
                    </Inspect.Span>
                );
            })}
        </>
    );
}
