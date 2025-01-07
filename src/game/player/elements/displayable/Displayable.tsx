import React, {useEffect, useState} from "react";
import {OverwriteDefinition, Transform, TransformState} from "@core/elements/transform/transform";
import {ITransition} from "@core/elements/transition/type";
import {useFlush} from "@player/lib/flush";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Displayable} from "@core/elements/displayable/displayable";
import {Awaitable, createMicroTask} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";

/**@internal */
export type StatefulObject = {
    state: Record<any, any>;
};

/**@internal */
export type DisplayableHookConfig = {
    skipTransition?: boolean;
    skipTransform?: boolean;
    overwriteDefinition?: OverwriteDefinition;
    state: TransformState<any>;
    element: EventfulDisplayable;
    onTransform?: (transform: Transform) => void;
    transformStyle?: React.CSSProperties;
};

/**@internal */
export type DisplayableHookResult = {
    ref: React.RefObject<HTMLDivElement | null>;
    transition?: ITransition;
};

/**@internal */
export function useDisplayable(
    {
        element,
        state,
        skipTransition,
        skipTransform,
        overwriteDefinition,
        onTransform,
        transformStyle,
    }: DisplayableHookConfig): DisplayableHookResult {
    const [flush] = useFlush();
    const [, setTransformStyle] = useState<React.CSSProperties>(transformStyle || {});
    const [transition, setTransition] = useState<null | ITransition>(null);
    const [transformToken, setTransformToken] = useState<null | Awaitable<void>>(null);
    const ref = React.useRef<HTMLDivElement | null>(null);
    const {game} = useGame();
    const gameState = game.getLiveGame().getGameState()!;

    useEffect(() => {
        return element.events.depends([
            element.events.on(Displayable.EventTypes["event:displayable.applyTransform"], applyTransform),
            element.events.on(Displayable.EventTypes["event:displayable.applyTransition"], applyTransition),
            element.events.on(Displayable.EventTypes["event:displayable.init"], initDisplayable),
        ]).cancel;
    }, [transformToken, transition]);

    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.skip"], skip).cancel;
    }, [transformToken, transition]);

    useEffect(() => {
        if (!ref.current) {
            throw new Error(`Scope not ready. Using element: ${element.constructor.name}`);
        }
    }, []);

    function handleOnTransform(transform: Transform) {
        setTransformStyle((prev) => {
            const style = Object.assign({}, prev, state.toStyle(gameState, overwriteDefinition));
            Object.assign(ref.current!.style, style);
            return style;
        });
        gameState.logger.debug("Displayable", "Transform applied", ref.current, state.toStyle(gameState, overwriteDefinition));

        flush();
        onTransform?.(transform);
    }

    function applyTransform(transform: Transform): Promise<void> {
        if (transformToken) {
            transformToken.abort();
            setTransformToken(null);
        }

        const initialStyle = state.toStyle(gameState, overwriteDefinition);
        Object.assign(ref.current!.style, initialStyle);
        return new Promise<void>(resolve => {
            createMicroTask(() => {
                const awaitable = transform.animate(
                    state,
                    {
                        gameState,
                        ref,
                        overwrites: overwriteDefinition,
                    }
                );
                setTransformToken(awaitable);
                awaitable.onSettled(() => {
                    setTransformToken(null);
                    handleOnTransform(transform);
                    resolve();
                });
            });
        });
    }

    function applyTransition(newTransition: ITransition): Promise<void> {
        if (transition) {
            transition.complete();
            setTransition(null);
        }
        setTransition(newTransition);

        return new Promise<void>(resolve => {
            createMicroTask(() => {
                flush();
                newTransition.start(() => {
                    setTransition(null);
                    flush();
                    resolve();
                });
            });
        });
    }

    function initDisplayable(): Promise<void> {
        gameState.logger.debug("initDisplayable", element);

        return applyTransform(Transform.immediate(state.get()));
    }

    function skip() {
        if (skipTransform && transformToken) {
            transformToken.abort();
            setTransformToken(null);

            gameState.logger.debug("transform skipped");
        }
        if (skipTransition && transition) {
            transition.complete();
            setTransition(null);

            gameState.logger.debug("transform skipped");
        }
    }

    return {
        ref,
        transition: transition || undefined,
    };
}



