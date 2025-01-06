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
    }, []);

    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.skip"], skip).cancel;
    }, []);

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
        }
        const initialStyle = state.toStyle(gameState, overwriteDefinition);
        Object.assign(ref.current!.style, initialStyle);
        return new Promise<void>(resolve => {
            const awaitable = transform.animate(
                state,
                {
                    gameState,
                    ref,
                    overwrites: overwriteDefinition,
                }
            );
            setTransformToken(awaitable);
            awaitable.then(() => {
                setTransformToken(null);
                resolve();
                handleOnTransform(transform);
            });
        });
    }

    function applyTransition(newTransition: ITransition): Promise<void> {
        if (transition) {
            transition.complete();
        }
        setTransition(newTransition);

        return new Promise<void>(resolve => {
            createMicroTask(() => {
                flush();
                newTransition.start(() => {
                    setTransition(null);
                    resolve();
                    flush();
                });
            });
        });
    }

    function initDisplayable(): Promise<void> {
        return new Promise<void>(resolve => {
            gameState.logger.debug("initDisplayable", element);

            const initStyle = state.toStyle(gameState, overwriteDefinition);
            Object.assign(ref.current!.style, initStyle);

            const transform = Transform.immediate(state.get());
            const token = transform.animate(
                state,
                {
                    gameState,
                    ref,
                    overwrites: overwriteDefinition,
                }
            );
            setTransformToken(token);
            token.then(() => {
                setTransformToken(null);
                resolve();
                handleOnTransform(transform);
            });
        });
    }

    function skip() {
        if (skipTransform && transformToken) {
            transformToken.abort();
            setTransformToken(null);

            gameState.logger.debug("transform skip");
        }
        if (skipTransition && transition) {
            transition.complete();
            setTransition(null);

            gameState.logger.debug("transition skip");
        }
    }

    return {
        ref,
        transition: transition || undefined,
    };
}



