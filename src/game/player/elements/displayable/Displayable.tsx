import React, {useEffect, useRef, useState} from "react";
import {OverwriteDefinition, Transform, TransformState} from "@core/elements/transform/transform";
import {
    AnimationController,
    AnimationDataTypeArray,
    ElementProp,
    TransitionAnimationType,
    TransitionTask
} from "@core/elements/transition/type";
import {useFlush} from "@player/lib/flush";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Displayable} from "@core/elements/displayable/displayable";
import {Awaitable, deepMerge} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {Transition} from "@core/elements/transition/transition";
import {RuntimeGameError} from "@core/common/Utils";

/**@internal */
export type StatefulObject = {
    state: Record<any, any>;
};

/**@internal */
export type DisplayableHookConfig<TransitionType extends Transition, U extends HTMLElement> = {
    skipTransition?: boolean;
    skipTransform?: boolean;
    overwriteDefinition?: OverwriteDefinition;
    state: TransformState<any>;
    element: EventfulDisplayable<TransitionType>;
    onTransform?: (transform: Transform) => void;
    transformStyle?: React.CSSProperties;
    transitionsProps?: ElementProp<U>[];
    propOverwrite?: (props: ElementProp<U>) => ElementProp<U>;
};

/**@internal */
export type DisplayableHookResult<T extends HTMLElement> = {
    transformRef: React.RefObject<HTMLDivElement | null>;
    transitionRefs: React.RefObject<T | null>[];
};

/**@internal */
export function useDisplayable<TransitionType extends Transition<U>, U extends HTMLElement>(
    {
        element,
        state,
        skipTransform,
        skipTransition,
        overwriteDefinition,
        onTransform,
        transformStyle,
        transitionsProps = [],
        propOverwrite,
    }: DisplayableHookConfig<TransitionType, U>): DisplayableHookResult<U> {
    const [flush] = useFlush();
    const [, setTransformStyle] = useState<React.CSSProperties>(transformStyle || {});
    const [transitionTask, setTransitionTask] = useState<null | {
        task: TransitionTask<U, any>;
        controller: AnimationController<any>;
    }>(null);
    const [transformToken, setTransformToken] = useState<null | Awaitable<void>>(null);
    const ref = React.useRef<HTMLDivElement | null>(null);
    const refs = useRef<React.RefObject<U | null>[]>(initRefs());
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
        if (!transitionTask) {
            return;
        }
        if (refs.current.some((ref) => !ref.current)) {
            throw new RuntimeGameError("Displayable: Trying to access transition groups before they are mounted");
        }

        const {controller, task} = transitionTask;
        const eventToken = controller.onUpdate((values: AnimationDataTypeArray<TransitionAnimationType[]>) => {
            refs.current.forEach((ref, i) => {
                if (!task.resolve[i]) {
                    throw new RuntimeGameError(
                        `Displayable: Trying to resolve element props but found no resolver. (reading: transitionTask.task.resolve[${i}])`
                    );
                }
                const resolved = task.resolve[i](...values);
                const mergedProps = deepMerge<ElementProp<U, React.HTMLAttributes<U>>>(
                    transitionsProps[i] || transitionsProps[transitionsProps.length - 1] || {},
                    resolved
                );
                assignProperties(ref, propOverwrite ? propOverwrite(mergedProps) : mergedProps);
            });
        });
        transitionTask.controller.start();

        return eventToken.cancel;
    }, [transitionTask]);

    useEffect(() => {
        if (refs.current.some((ref) => !ref.current)) {
            throw new RuntimeGameError("Displayable: Trying to access transition groups before they are mounted");
        }
        refs.current.forEach((ref, index) => {
            if (!ref.current) {
                throw new RuntimeGameError("Displayable: Trying to assign properties to unmounted element");
            }
            assignProperties(ref, transitionsProps[index] || transitionsProps[transitionsProps.length - 1] || {});
        });
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

    function assignProperties<T extends HTMLElement>(ref: React.RefObject<T | null>, properties: Partial<React.HTMLAttributes<T>>) {
        if (!ref.current) {
            throw new RuntimeGameError("Displayable: Trying to assign properties to unmounted element");
        }

        const element = ref.current;
        const styleUpdates: Partial<CSSStyleDeclaration> = {};

        const attributesToUpdate: Record<string, string> = {};
        Object.keys(properties).forEach((k) => {
            const key = k as keyof React.HTMLAttributes<T>;
            if (key === "style" && properties.style) {
                Object.assign(styleUpdates, properties.style);
            } else if (properties[key] !== undefined) {
                attributesToUpdate[key] = String(properties[key]);
            }
        });

        if (Object.keys(styleUpdates).length > 0) {
            Object.assign(element.style, styleUpdates);
        }

        for (const [attr, value] of Object.entries(attributesToUpdate)) {
            element.setAttribute(attr, value);
        }
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
            refs.current = initRefs();
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
        if (skipTransition && transitionTask) {
            transitionTask.controller.complete();
            setTransitionTask(null);

            gameState.logger.debug("transition skipped");
        }
    }

    function initRefs(): React.RefObject<U | null>[] {
        return [React.createRef<U | null>()];
    }

    return {
        transformRef: ref,
        transitionRefs: refs.current,
    };
}



