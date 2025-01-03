import React, {useEffect, useState} from "react";
import {OverwriteDefinition, Transform, TransformState} from "@core/elements/transform/transform";
import {ITransition} from "@core/elements/transition/type";
import {useFlush} from "@player/lib/flush";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Displayable} from "@core/elements/displayable/displayable";
import {Awaitable} from "@lib/util/data";
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
};

/**@internal */
export type DisplayableHookResult = {
    transition: ITransition | null;
    ref: React.RefObject<HTMLDivElement | null>;
};

/**@internal */
export function useDisplayable(
    {
        element,
        state,
        skipTransition,
        skipTransform,
        overwriteDefinition,
    }: DisplayableHookConfig): DisplayableHookResult {
    const [flush] = useFlush();
    const [transition, setTransition] = useState<null | ITransition>(null);
    const [transformToken, setTransformToken] = useState<null | Awaitable<void>>(null);
    const ref = React.useRef<HTMLDivElement | null>(null);
    const {game} = useGame();
    const gameState = game.getLiveGame().getGameState()!;

    useEffect(() => {
        return element.events.onEvents([
            {
                type: Displayable.EventTypes["event:displayable.applyTransform"],
                listener: element.events.on(Displayable.EventTypes["event:displayable.applyTransform"], applyTransform)
            },
            {
                type: Displayable.EventTypes["event:displayable.applyTransition"],
                listener: element.events.on(Displayable.EventTypes["event:displayable.applyTransition"], applyTransition)
            },
            {
                type: Displayable.EventTypes["event:displayable.init"],
                listener: element.events.on(Displayable.EventTypes["event:displayable.init"], initDisplayable)
            }
        ]).cancel;
    }, [transition, transformToken]);

    useEffect(() => {
        return gameState.events.onEvents([
            {
                type: GameState.EventTypes["event:state.player.skip"],
                listener: gameState.events.on(GameState.EventTypes["event:state.player.skip"], skip),
            }
        ]).cancel;
    }, [transition, transformToken]);

    useEffect(() => {
        if (!ref.current) {
            throw new Error(`Scope not ready. Using element: ${element.constructor.name}`);
        }
    }, []);

    function applyTransform(transform: Transform): Promise<void> {
        if (transformToken) {
            transformToken.abort();
        }
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
            });
        });
    }

    function applyTransition(newTransition: ITransition): Promise<void> {
        if (transition) {
            transition.complete();
        }
        setTransition(newTransition);
        return new Promise<void>(resolve => {
            newTransition.start(() => {
                setTransition(null);
                resolve();
            });
        });
    }

    function initDisplayable(): Promise<void> {
        return new Promise<void>(resolve => {
            gameState.logger.debug("initDisplayable", element);

            const initStyle = state.toStyle(gameState);
            Object.assign(ref.current!.style, initStyle);

            const token = Transform.immediate(state.get()).animate(
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
                flush();
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
        transition,
        ref,
    };
}



