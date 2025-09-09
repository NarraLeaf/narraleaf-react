import { Word } from "@core/elements/character/word";
import { Script } from "@lib/game/nlcore/elements/script";
import { RawTexts } from "@player/elements/say/Sentence";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DialogState } from "../../say/UIDialog";
import { ChoiceEvaluated } from "../type";
import { useUIListContext, useUIMenuContext } from "./context";

export interface ItemProps {
    className?: string;
    style?: React.CSSProperties;
    /**
     * The keyboard binding for this item, see [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values) for more information
     * 
     * When this key is pressed, the item will be selected and the action will be executed
     */
    bindKey?: string;
}

export default function Item({ className, style, bindKey }: ItemProps) {
    const ref = useRef<HTMLButtonElement>(null);
    const { register, unregister, getIndex } = useUIListContext();
    const [index, setIndex] = useState(-1);
    const { choose, evaluated, gameState } = useUIMenuContext();

    const choice: ChoiceEvaluated | null = index === -1 ? null : evaluated[index];
    const ctx = useMemo(() => Script.getCtx({ gameState }), [gameState]);
    const { hidden, disabled } = useMemo(() => {
        if (!choice) return { hidden: false, disabled: false };

        const hidden = choice.config.hidden?.evaluate(ctx)?.value ?? false;
        const disabled = !hidden && (choice.config.disabled?.evaluate(ctx)?.value ?? false);

        return { hidden, disabled };
    }, [choice, ctx]);

    useLayoutEffect(() => {
        if (!ref.current) return;
        const elementRef = ref as React.RefObject<HTMLButtonElement>;

        register(elementRef);
        const currentIndex = getIndex(elementRef);
        setIndex(currentIndex);
        ref.current.dataset.index = currentIndex.toString();

        return () => unregister(elementRef);
    }, [register, unregister, getIndex]);

    useEffect(() => {
        if (!bindKey) return;

        const listener = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === bindKey.toLowerCase() && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                handleClick();
            }
        };
        window.addEventListener("keydown", listener, true);
        return () => {
            window.removeEventListener("keydown", listener, true);
        };
    }, [bindKey]);

    function handleClick() {
        if (index === -1 || !evaluated[index] || hidden || disabled) return;
        const currentChoice = evaluated[index];
        choose({
            ...currentChoice,
            evaluated: Word.getText(currentChoice.words || []),
        });
    }

    const visibility = choice && !hidden;

    return (
        <>
            <button
                className={className}
                style={{
                    ...style,
                    display: visibility ? (style?.display ?? undefined) : "none",
                }}
                onClick={handleClick}
                ref={ref}
                disabled={disabled}
            >
                {(visibility && <RawTexts
                    dialog={new DialogState({
                        useTypeEffect: false,
                        action: {
                            sentence: choice.prompt,
                            words: choice.words,
                            character: null,
                        },
                        gameState,
                        evaluatedWords: choice.words,
                    })}
                />)}
            </button>
        </>
    );
}
