import {GameState} from "@player/gameState";
import {Text as GameText} from "@core/elements/displayable/text";
import React from "react";
import {Transform} from "@core/elements/transform/transform";
import Inspect from "@player/lib/Inspect";
import {useRatio} from "@player/provider/ratio";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {TextTransition} from "@core/elements/transition/transitions/text/textTransition";
import {useExposeState} from "@player/lib/useExposeState";

/**@internal */
export default function Text({state, text}: Readonly<{
    state: GameState;
    text: GameText;
}>) {
    const {ratio} = useRatio();
    const {
        transformRef,
        transitionRefs,
        initDisplayable,
        applyTransform,
        applyTransition,
    } = useDisplayable<TextTransition, HTMLSpanElement>({
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
        },
        transitionsProps: [
            {
                style: {
                    width: "fit-content",
                    whiteSpace: "nowrap",
                    transform: `scale(${ratio.state.scale})`,
                    transformOrigin: `${text.config.alignX} ${text.config.alignY}`,
                },
            },
        ],
    });

    useExposeState(text, {
        initDisplayable,
        applyTransform,
        applyTransition,
    });

    return (
        <Inspect.Div>
            <Inspect.mDiv
                tag={"text.container"}
                color={"green"}
                border={"dashed"}
                layout
                ref={transformRef}
                className={"absolute"}
            >
                {transitionRefs.map(([ref, key]) => (
                    <span
                        key={key}
                        ref={ref}
                        className={text.config.className}
                    >
                        <span>{text.state.text}</span>
                    </span>
                ))}
            </Inspect.mDiv>
        </Inspect.Div>
    );
}
