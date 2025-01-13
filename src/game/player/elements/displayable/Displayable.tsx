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
import {Awaitable, deepMerge, KeyGen} from "@lib/util/data";
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
    transitionRefs: RefGroupDefinition<T>[];
};

/**@internal */
type RefGroupDefinition<T extends HTMLElement> = [ref: React.RefObject<T | null>, key: string];
type RefGroup<T extends HTMLElement> = React.RefObject<RefGroupDefinition<T>[]>;

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
    const [keyGen] = useState(() => new KeyGen("displayable.refGroup"));
    const currentKey = useRef<string>(keyGen.next());
    const refs = useRef<RefGroupDefinition<U>[]>(initRefs()) satisfies RefGroup<U>;
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
        if (!transitionTask) {
            return;
        }
        if (refs.current.some(([ref]) => !ref.current)) {
            throw new RuntimeGameError("Displayable: Trying to access transition groups before they are mounted");
        }

        const {controller, task} = transitionTask;
        const eventToken = controller.onUpdate((values: AnimationDataTypeArray<TransitionAnimationType[]>) => {
            refs.current.forEach(([ref], i) => {
                const currentResolve = task.resolve[i];
                const resolver = typeof currentResolve === "function" ? currentResolve : currentResolve.resolver;
                if (!resolver) {
                    throw new RuntimeGameError(
                        `Displayable: Trying to resolve element props but found no resolver. (reading: transitionTask.task.resolve[${i}])`
                    );
                }

                const resolved = resolver(...values);
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
        if (!refs.current || !refs.current.length) {
            throw new RuntimeGameError("Displayable: Transition group refs are not initialized correctly");
        }
        if (refs.current.some(([ref]) => !ref.current)) {
            throw new RuntimeGameError("Displayable: Trying to access transition groups before they are mounted");
        }
        refs.current.forEach(([ref], index) => {
            if (!ref.current) {
                throw new RuntimeGameError("Displayable: Trying to assign properties to unmounted element");
            }
            assignProperties(ref, transitionsProps[index] || transitionsProps[transitionsProps.length - 1] || {});
        });
    }, [transitionTask]);

    useEffect(() => {
        if (!ref.current) {
            throw new Error(`Scope not ready. Using element: ${element.constructor.name}`);
        }
        element.events.emit(Displayable.EventTypes["event:displayable.onMount"]);
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

    function assignProperties(ref: React.RefObject<U | null>, properties: ElementProp<U, React.HTMLAttributes<U>>) {
        if (!ref.current) {
            throw new RuntimeGameError("Displayable: Trying to assign properties to unmounted element");
        }

        const element = ref.current;
        const styleUpdates: Partial<CSSStyleDeclaration> = {};

        const attributesToUpdate: ElementProp<U, React.HTMLAttributes<U>> = {} as ElementProp<U, React.HTMLAttributes<U>>;
        Object.keys(properties).forEach((k) => {
            const key = k as keyof Partial<ElementProp<U>>;
            if (key === "style" && properties.style) {
                Object.assign(styleUpdates, properties.style);
            } else if (properties[key] !== undefined && key !== "key") {
                attributesToUpdate[key] = properties[key];
            }
        });

        if (Object.keys(styleUpdates).length > 0) {
            Object.assign(element.style, styleUpdates);
        }

        const overwrite = propOverwrite ? propOverwrite(attributesToUpdate) : attributesToUpdate;
        for (const [attr, value] of Object.entries(overwrite)) {
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

        let nextKey: string;
        refs.current = task.resolve.map((solution) => {
            const ref = React.createRef<U | null>();
            const type = typeof solution === "function" ? undefined : solution.key;

            if (!type) {
                return [ref, keyGen.next()];
            }
            if (type === "target") {
                nextKey = keyGen.next();
                return [ref, nextKey];
            } else if (type === "current") {
                return [ref, currentKey.current];
            }

            throw new RuntimeGameError("Displayable: Invalid key type");
        });

        controller.onComplete(() => {
            refs.current.forEach(([ref]) => {
                ref.current = null;
            });
            currentKey.current = nextKey;
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

    function initRefs(): RefGroupDefinition<U>[] {
        return [[React.createRef<U | null>(), currentKey.current]];
    }

    element.events.emit(Displayable.EventTypes["event:displayable.onFlush"]);

    return {
        transformRef: ref,
        transitionRefs: refs.current,
    };
}



