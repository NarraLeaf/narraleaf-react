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
import {Awaitable, deepMerge, KeyGen, SkipController} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {Transition} from "@core/elements/transition/transition";
import {RuntimeGameError} from "@core/common/Utils";
import {Timeline} from "@player/Tasks";

/**@internal */
export type DisplayableHookConfig<TransitionType extends Transition<U>, U extends HTMLElement> = {
    skipTransition?: boolean;
    skipTransform?: boolean;
    overwriteDefinition?: OverwriteDefinition;
    state: TransformState<any>;
    element: EventfulDisplayable;
    onTransform?: (transform: Transform) => void;
    /**@deprecated */
    transformStyle?: React.CSSProperties;
    transitionsProps?: ElementProp<U>[] | ((task: TransitionTaskWithController<TransitionType, U> | null) => (ElementProp<U>[]));
    propOverwrite?: (props: ElementProp<U>) => ElementProp<U>;
};

/**@internal */
type TransitionTaskWithController<TransitionType extends Transition<U>, U extends HTMLElement> = {
    task: TransitionTask<U, any>;
    controller: AnimationController<any>;
    transition: TransitionType;
    resolve: VoidFunction;
};

/**@internal */
export type DisplayableHookResult<TransitionType extends Transition<U>, U extends HTMLElement> = {
    transformRef: React.RefObject<HTMLDivElement | null>;
    transitionRefs: RefGroupDefinition<U>[];
    isTransforming: boolean;
    transitionTask: TransitionTaskWithController<TransitionType, U> | null;
    initDisplayable: (resolve: () => void) => Timeline;
    applyTransform: (transform: Transform, resolve: () => void) => Timeline;
    applyTransition: (transition: Transition, resolve: () => void) => Timeline;
    deps: React.DependencyList;
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
        transitionsProps = [],
        propOverwrite,
    }: DisplayableHookConfig<TransitionType, U>): DisplayableHookResult<TransitionType, U> {
    const [transitionTask, setTransitionTask] = useState<null | TransitionTaskWithController<TransitionType, U>>(null);
    const [transformToken, setTransformToken] = useState<null | Awaitable<void>>(null);
    const ref = React.useRef<HTMLDivElement | null>(null);
    const [keyGen] = useState(() => new KeyGen("displayable.refGroup"));
    const currentKey = useRef<string>(keyGen.next());
    const refs = useRef<RefGroupDefinition<U>[]>(initRefs()) satisfies RefGroup<U>;
    const game = useGame();
    const gameState = game.getLiveGame().getGameState()!;
    const evaluatedTransProps = typeof transitionsProps === "function"
        ? transitionsProps(transitionTask)
        : transitionsProps;
    const [flush] = useFlush([transformToken, transitionTask, refs]);

    useEffect(() => {
        return gameState.events.depends([
            gameState.events.on(GameState.EventTypes["event:state.player.skip"], skip),
        ]).cancel;
    }, [transformToken, transitionTask, refs]);

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
                    evaluatedTransProps[i] || evaluatedTransProps[evaluatedTransProps.length - 1] || {},
                    resolved
                );
                assignProperties(ref, propOverwrite ? propOverwrite(mergedProps) : mergedProps);
            });
        });

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
            assignProperties(ref, evaluatedTransProps[index] || evaluatedTransProps[evaluatedTransProps.length - 1] || {});
        });
    }, [transitionTask]);

    useEffect(() => {
        if (!ref.current) {
            throw new Error(`Scope not ready. Using element: ${element.constructor.name}`);
        }
    }, []);

    useEffect(() => {
        const initialStyle = state.toStyle(gameState, overwriteDefinition);

        Object.assign(ref.current!.style, initialStyle);
        gameState.logger.debug("Displayable", "Initial style applied", ref.current, initialStyle);
    }, []);

    function handleOnTransform(transform: Transform) {
        gameState.logger.debug("Displayable", "Transform applied", state.toStyle(gameState, overwriteDefinition), ref.current);

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
            if (element.getAttribute(attr) === value) {
                continue;
            }
            element.setAttribute(attr, value);
        }
    }

    function applyTransform(transform: Transform, resolve: () => void): Timeline {
        if (transformToken) {
            transformToken.abort();
            setTransformToken(null);
        }

        const awaitable = transform.animate(
            state,
            {
                gameState,
                ref,
                overwrites: overwriteDefinition,
            }
        );
        const timeline = new Timeline(awaitable);

        gameState.timelines.attachTimeline(timeline);
        awaitable.onSkipControllerRegister((controller) => {
            controller.onAbort(() => {
                timeline.abort();
            });
        });

        setTransformToken(awaitable);
        awaitable.then(() => {
            setTransformToken(null);
            handleOnTransform(transform);
            resolve();
        });

        return timeline;
    }

    function applyTransition(newTransition: TransitionType, resolve: () => void): Timeline {
        if (transitionTask) {
            transitionTask.controller.complete();
        }

        const task = newTransition.createTask(gameState);
        const controller = newTransition.requestAnimations(task.animations);
        const awaitable = new Awaitable<void>()
            .registerSkipController(new SkipController(controller.cancel));
        const timeline = new Timeline(awaitable);

        awaitable.skipController!.onAbort(() => {
            controller.cancel();
        });
        controller.onCanceled(() => {
            timeline.abort();
        });
        gameState.timelines.attachTimeline(timeline);
        setTransitionTask({
            task,
            controller,
            transition: newTransition,
            resolve,
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
        if (!nextKey!) {
            throw new RuntimeGameError("Displayable: No target key found");
        }
        currentKey.current = nextKey;

        controller.start();
        controller.onComplete(() => {
            resetRefs();

            setTransitionTask(null);
            resolve();
            awaitable.resolve();
        });

        return timeline;
    }

    function initDisplayable(resolve: () => void): Timeline {
        gameState.logger.debug("initDisplayable", element);

        return applyTransform(Transform.immediate(state.get()), resolve);
    }

    function skip() {
        if (skipTransform && transformToken) {
            transformToken.abort();
            setTransformToken(null);

            gameState.logger.debug("transform skipped");
        }
        if (skipTransition && transitionTask) {
            transitionTask.controller.complete();

            gameState.logger.debug("transition skipped");
        }
    }

    function initRefs(): RefGroupDefinition<U>[] {
        return [[React.createRef<U | null>(), currentKey.current]];
    }

    function resetRefs() {
        refs.current.forEach(([ref]) => {
            ref.current = null;
        });
        refs.current = initRefs();
    }

    return {
        transformRef: ref,
        transitionRefs: refs.current,
        isTransforming: !!transformToken,
        transitionTask,
        initDisplayable,
        applyTransform,
        applyTransition: applyTransition as (transition: Transition, resolve: () => void) => Timeline,
        deps: [transformToken, transitionTask, refs],
    };
}



