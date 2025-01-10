import React, {useEffect, useRef, useState} from "react";
import {OverwriteDefinition, Transform, TransformState} from "@core/elements/transform/transform";
import {AnimationController, ITransition, TransitionTask} from "@core/elements/transition/type";
import {useFlush} from "@player/lib/flush";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Displayable} from "@core/elements/displayable/displayable";
import {Awaitable} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {Transition} from "@core/elements/transition/transition";

/**@internal */
export type StatefulObject = {
    state: Record<any, any>;
};

/**@internal */
export type DisplayableHookConfig<TransitionType extends Transition> = {
    skipTransition?: boolean;
    skipTransform?: boolean;
    overwriteDefinition?: OverwriteDefinition;
    state: TransformState<any>;
    element: EventfulDisplayable<TransitionType>;
    onTransform?: (transform: Transform) => void;
    transformStyle?: React.CSSProperties;
};

/**@internal */
export type DisplayableHookResult = {
    ref: React.RefObject<HTMLDivElement | null>;
    transition?: ITransition;
};

/**@internal */
export function useDisplayable<TransitionType extends Transition<U>, U extends HTMLElement>(
    {
        element,
        state,
        skipTransform,
        overwriteDefinition,
        onTransform,
        transformStyle,
    }: DisplayableHookConfig<TransitionType>): DisplayableHookResult {
    const [flush] = useFlush();
    const [, setTransformStyle] = useState<React.CSSProperties>(transformStyle || {});
    const [transitionTask, setTransitionTask] = useState<null | {
        task: TransitionTask<U, any>;
        controller: AnimationController<any>;
    }>(null);
    const [transformToken, setTransformToken] = useState<null | Awaitable<void>>(null);
    const ref = React.useRef<HTMLDivElement | null>(null);
    const refs = useRef<React.RefObject<U | null>[]>([]);
    const {game} = useGame();
    const gameState = game.getLiveGame().getGameState()!;

    useEffect(() => {
        return element.events.depends([
            element.events.on(Displayable.EventTypes["event:displayable.applyTransform"], applyTransform),
            element.events.on(Displayable.EventTypes["event:displayable.applyTransition"], applyTransition),
            element.events.on(Displayable.EventTypes["event:displayable.init"], initDisplayable),
        ]).cancel;
    }, [transformToken, transitionTask, refs]);

    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.skip"], skip).cancel;
    }, [transformToken, transitionTask]);

    useEffect(() => {
        if (!ref.current) {
            throw new Error(`Scope not ready. Using element: ${element.constructor.name}`);
        }
        element.events.emit(Displayable.EventTypes["event:displayable.onMount"]);
    }, []);

    useEffect(() => {

    }, [transitionTask]);

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

    function applyTransform(transform: Transform, resolve: () => void): void {
        if (transformToken) {
            transformToken.abort();
            setTransformToken(null);
        }

        const initialStyle = state.toStyle(gameState, overwriteDefinition);
        Object.assign(ref.current!.style, initialStyle);

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
            handleOnTransform(transform);
            resolve();
        });
    }

    function applyTransition(newTransition: TransitionType, resolve: () => void): void {
        if (transitionTask) {
            transitionTask.controller.complete();
        }

        const task = newTransition.createTask();
        const controller = newTransition.requestAnimations(task.animations);
        setTransitionTask({
            task,
            controller,
        });
        refs.current = task.resolve.map(() => React.createRef<U | null>());

        controller.onComplete(() => {
            refs.current.forEach((ref) => {
                ref.current = null;
            });
            refs.current = [];
            setTransitionTask(null);
            resolve();
        });
    }

    function initDisplayable(resolve: () => void): void {
        gameState.logger.debug("initDisplayable", element);

        applyTransform(Transform.immediate(state.get()), resolve);
    }

    function skip() {
        if (skipTransform && transformToken) {
            transformToken.abort();
            setTransformToken(null);

            gameState.logger.debug("transform skipped");
        }
        // if (skipTransition && transitionTask) {
        //     transitionTask.complete();
        //     setTransitionTask(null);
        //
        //     gameState.logger.debug("transform skipped");
        // }
    }

    return {
        ref,
        transition: (transitionTask || undefined) as any, // @unsafe
    };
}



