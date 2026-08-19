import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {
    OverwriteDefinition,
    Transform,
    TransformCompanionRef,
    TransformLoopHandle,
    TransformState
} from "@core/elements/transform/transform";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {
    AnimationController,
    AnimationDataTypeArray,
    ElementProp,
    TransitionAnimationType,
    TransitionTask
} from "@core/elements/transition/type";
import {useFlush} from "@player/lib/flush";
import {useRatio} from "@player/provider/ratio";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Awaitable, deepMerge, KeyGen, SkipController} from "@lib/util/data";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {Transition} from "@core/elements/transition/transition";
import {RuntimeGameError} from "@core/common/Utils";
import {Timeline} from "@player/Tasks";
import {DisplayableElementRef, DisplayableRefGroup} from "@player/elements/displayable/type";
import {assignElementProps} from "@player/lib/elementProps";

/**@internal */
export type DisplayableHookConfig<TransitionType extends Transition<U>, U extends HTMLElement> = {
    skipTransition?: boolean;
    skipTransform?: boolean;
    overwriteDefinition?: OverwriteDefinition;
    state: TransformState<any>;
    element: EventfulDisplayable;
    onTransform?: (transform: Transform) => void;
    onTransition?: (transition: TransitionType) => void;
    /**@deprecated */
    transformStyle?: React.CSSProperties;
    transitionsProps?: ElementProp<U>[] | ((task: TransitionTaskWithController<TransitionType, U> | null) => (ElementProp<U>[]));
    propOverwrite?: (props: ElementProp<U>) => ElementProp<U>;
    /**
     * Elements outside this displayable's own wrapper that are nonetheless driven by its transform
     * state — see {@link TransformCompanionRef}. They are animated in the same `motion` sequence as
     * the wrapper, and their settled style is written next to the wrapper's.
     */
    companionRefs?: TransformCompanionRef[];
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
    transitionRefs: DisplayableRefGroup<U>[];
    transitionTask: TransitionTaskWithController<TransitionType, U> | null;
    initDisplayable: (resolve: () => void) => Timeline;
    applyTransform: (transform: Transform, resolve: () => void) => Timeline;
    applyTransition: (transition: Transition, resolve: () => void) => Timeline;
    applyLoop: (transform: Transform, options?: TransformDefinitions.LoopOptions) => void;
    stopLoop: (options: TransformDefinitions.LoopStopOptions | undefined, resolve: () => void) => Timeline;
    updateStyleSync: () => void;
    flush: () => void;
    deps: React.DependencyList;
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
        onTransition,
        transitionsProps = [],
        propOverwrite,
        companionRefs,
    }: DisplayableHookConfig<TransitionType, U>): DisplayableHookResult<TransitionType, U> {
    const [transitionTask, setTransitionTask] = useState<null | TransitionTaskWithController<TransitionType, U>>(null);
    const [transformToken, setTransformToken] = useState<null | Awaitable<void>>(null);
    /* A ref, not state: the loop has to be stoppable from inside `applyTransform`, which may run
       several times before React re-renders, and a stale closure there would leave an orphaned
       animation writing the wrapper behind the transform that just replaced it. Nothing renders
       differently for a loop either, so there is no state for it to be. */
    const loopHandleRef = useRef<TransformLoopHandle | null>(null);
    const ref = React.useRef<HTMLDivElement | null>(null);
    const [keyGen] = useState(() => new KeyGen("displayable.refGroup"));
    const currentKey = useRef<string>(keyGen.next());
    const refs = useRef<DisplayableRefGroup<U>[]>(initRefs());
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

    useLayoutEffect(() => {
        updateStyleSync();

        if (!transitionTask) {
            return;
        }
        if (refs.current.some(([ref]) => !ref.current)) {
            throw new RuntimeGameError("Displayable: Trying to access transition groups before they are mounted");
        }

        const {controller, task} = transitionTask;
        const applyFrame = (values: AnimationDataTypeArray<TransitionAnimationType[]>) => {
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
        };
        const eventToken = controller.onUpdate(applyFrame);

        // Paint the exact start pose before the animation is allowed to run. The resolvers are
        // the only source of some of the groups' props — notably the incoming element's `src` —
        // so without this frame the target sits unstyled (and srcless) until the first
        // animation tick, and the load gate below would deadlock on an image that was never
        // given a source.
        applyFrame(task.animations.map((animation) => animation.start) as AnimationDataTypeArray<TransitionAnimationType[]>);

        // Gate the start on every group being loaded and decoded. The gate must be taken here,
        // in the commit that mounted the groups: `applyTransition` replaces the refs before
        // React attaches them, so a gate taken there reads `null` refs and waits on nothing —
        // which is exactly how transitions used to race their images' decodes and reveal blank
        // frames. `stale` covers replacement/unmount; a settled or cancelled controller makes
        // `start()` a no-op on its own.
        let stale = false;
        Promise.all(refs.current.map(([ref]) => {
            const loadableElement = ref.current;
            return loadableElement?.waitForLoad ? loadableElement.waitForLoad() : Promise.resolve();
        })).then(() => {
            if (!stale) {
                controller.start();
            }
        });

        return () => {
            stale = true;
            eventToken.cancel();
        };
    }, [transitionTask]);

    useEffect(() => {
        if (!ref.current) {
            throw new Error(`Scope not ready. Using element: ${element.constructor.name}`);
        }
    }, []);

    useLayoutEffect(() => {
        const initialStyle = state.toStyle(gameState, overwriteDefinition);

        Object.assign(ref.current!.style, initialStyle);
        applyCompanionStyles();
        gameState.logger.debug("Displayable", "Initial style applied", ref.current, initialStyle);

        // An element that was already looping when it was mounted — remounted after a load, or put
        // back on stage by a scene it re-enters — starts looping again here. The element's binding
        // is what says so; nothing replays the action that set it.
        reconcileLoop();

        return () => {
            stopLoopMotion();
        };
    }, []);

    // Self-heal the wrapper's settled style whenever no animation owns the element. The wrapper's
    // transform is written imperatively by `transform.animate` / layout projection; an interrupted
    // animation (or motion's layout cleanup) can leave a stale or cleared `transform` behind, which
    // shows up as a permanently mispositioned displayable — especially after the stage container
    // resizes mid-animation. Re-deriving from the TransformState (the source of truth) on each
    // settled render makes any such corruption converge back to the correct pose.
    const healSettledStyleRef = useRef<() => void>(() => undefined);
    healSettledStyleRef.current = () => {
        if (transitionTask || !ref.current) {
            return;
        }
        // The groups' props are derived from state that outlives a single render — a text's font
        // size and, notably, the stage scale every text is sized by — but they only reach the DOM
        // when this hook writes them, so a settled element whose inputs changed keeps painting the
        // old ones. Re-deriving them here is what makes them converge.
        //
        // Ahead of the animation guard below, not under it, because the animation this guard is
        // about is a *transition* — that is what writes group props every frame, and it is already
        // excluded above. A transform writes the wrapper and never these, so re-deriving them
        // while one runs changes nothing. A loop makes the distinction matter rather than merely
        // being tidy: a loop has no end, so anything held back until the animation settles is held
        // back forever, and a looping text would keep painting the scale it had before the last
        // stage resize.
        updateStyleSync();
        // A running loop owns the wrapper exactly as a transform does — it is just never going to
        // settle. Without it in this guard, every render would paint the pre-loop pose over the
        // frame the loop had just written, and `motion` would take it back on the next tick.
        if (transformToken || loopHandleRef.current) {
            return;
        }
        Object.assign(ref.current.style, state.toStyle(gameState, overwriteDefinition));
        // Companions are driven only while an animation is running, so without this they would be
        // correct for the length of a transform and wrong for the rest of the scene — the settled
        // pose has to be re-derived for them exactly as it is for the wrapper.
        applyCompanionStyles();
    };
    useLayoutEffect(() => {
        // `LiveGame.newGame()` resets every element while the player stays mounted, so a loop can
        // lose its binding without anything else touching this element. Checking on each render is
        // what stops a motion from outliving the playthrough that started it.
        if (loopHandleRef.current && !element._getLoop()) {
            stopLoopMotion();
        }
        healSettledStyleRef.current();
    });

    // Stage resizes are when layout projection touches wrapper transforms, and projection cleanup
    // can land after this component's last render — heal on every ratio update, plus one frame
    // later to catch that trailing cleanup.
    const {ratio} = useRatio();
    useEffect(() => {
        return ratio.onUpdate(() => {
            healSettledStyleRef.current();
            requestAnimationFrame(() => healSettledStyleRef.current());
        });
    }, [ratio]);

    /**
     * Write each companion's settled style from the current transform state.
     *
     * Called from the mount effect and from the settled-style heal, which together cover every
     * moment no animation owns the element — the two places the wrapper's own style is written.
     */
    function applyCompanionStyles() {
        if (!companionRefs) {
            return;
        }
        for (const {ref: companionRef, project} of companionRefs) {
            if (companionRef.current) {
                Object.assign(companionRef.current.style, project(state.get()));
            }
        }
    }

    function updateStyleSync() {
        const evaluatedTransProps = typeof transitionsProps === "function"
            ? transitionsProps(transitionTask)
            : transitionsProps;
        if (!refs.current || !refs.current.length) {
            throw new RuntimeGameError("Displayable: Transition group refs are not initialized correctly");
        }
        // The groups are legitimately ref-less between a render that replaces them and the commit
        // that re-attaches them — `resetRefs` does exactly this when a transition ends, and an
        // action running off the transition's `resolve` lands right in that window. Skipping is
        // safe (and the only option that isn't a crash): the pending commit's layout effect calls
        // this again, and it re-reads the props, so nothing is lost by not writing them twice.
        if (refs.current.some(([ref]) => !ref.current)) {
            return;
        }
        refs.current.forEach(([ref], index) => {
            assignProperties(ref, evaluatedTransProps[index] || evaluatedTransProps[evaluatedTransProps.length - 1] || {});
        });
    }

    function handleOnTransform(transform: Transform) {
        gameState.logger.debug("Displayable", "Transform applied", state.toStyle(gameState, overwriteDefinition), ref.current);

        flush();
        onTransform?.(transform);
    }

    function assignProperties(ref: React.RefObject<U | null>, properties: ElementProp<U, React.HTMLAttributes<U>>) {
        if (!ref.current) {
            throw new RuntimeGameError("Displayable: Trying to assign properties to unmounted element");
        }

        assignElementProps(ref.current, properties, propOverwrite);
    }

    /**
     * Stop the running loop's motion, leaving the element where the loop had got to.
     *
     * Only the motion: the element's binding is untouched, so whatever put the element back in
     * charge of its own pose decides whether the loop comes back.
     */
    function stopLoopMotion() {
        if (!loopHandleRef.current) {
            return;
        }
        loopHandleRef.current.stop();
        loopHandleRef.current = null;

        gameState.logger.debug("Displayable", "Loop stopped", element);
    }

    /**
     * Make the running motion agree with what the element declares.
     *
     * This is the one place a loop is (re)started other than the action that sets it, and it is why
     * a loop survives everything that repaints an element without meaning to end it: mounting,
     * `initDisplayable`, and `GameState.forceAnimation` all finish by handing the element back to
     * itself, and the binding is still there to be read.
     */
    function reconcileLoop() {
        const binding = element._getLoop();
        if (!binding) {
            stopLoopMotion();
            return;
        }
        if (loopHandleRef.current) {
            return;
        }
        applyLoop(binding.transform, binding.options);
    }

    function applyLoop(transform: Transform, options?: TransformDefinitions.LoopOptions): void {
        if (transformToken) {
            transformToken.abort();
            setTransformToken(null);
        }
        stopLoopMotion();
        if (!ref.current) {
            // Set before the element was mounted. The mount effect reconciles from the binding, so
            // there is nothing to do here and nothing lost by doing nothing.
            return;
        }

        loopHandleRef.current = transform.startLoop(
            state,
            {
                gameState,
                ref,
                overwrites: overwriteDefinition,
                companionRefs,
            },
            options,
        );
    }

    /**
     * End the loop by taking the element back to its own pose.
     *
     * A plain transform to the state the element already holds - which is the pre-loop pose,
     * because a loop never writes to it. So this is a normal, finite, waitable transform, and it
     * ends the loop for the same reason any other transform does.
     */
    function stopLoop(options: TransformDefinitions.LoopStopOptions | undefined, resolve: () => void): Timeline {
        return applyTransform(new Transform({}, {
            duration: options?.duration ?? 0,
            ease: options?.ease ?? "linear",
        }), resolve);
    }

    function applyTransform(transform: Transform, resolve: () => void): Timeline {
        if (transformToken) {
            transformToken.abort();
            setTransformToken(null);
        }
        // An element carries one transform at a time, so this one takes over. Only the motion is
        // stopped here - whether the loop comes back once this transform settles is decided by the
        // element's binding, which the action that applies an authored transform clears and an
        // internal repaint (mount, `forceAnimation`) leaves alone.
        stopLoopMotion();

        const awaitable = transform.animate(
            state,
            {
                gameState,
                ref,
                overwrites: overwriteDefinition,
                companionRefs,
            }
        );
        const timeline = new Timeline(awaitable);

        gameState.timelines.attachTimeline(timeline);
        awaitable.onSkipControllerRegister((controller) => {
            controller.onAbort(() => {
                timeline.abort();
                setTransformToken(null);
            });
        });

        setTransformToken(awaitable);
        awaitable.then(() => {
            setTransformToken(null);
            handleOnTransform(transform);
            resolve();
            reconcileLoop();
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
            setTransitionTask(null);

            gameState.logger.debug("Displayable", "Transition cancelled", newTransition);
        });
        // Registered before the animation can possibly start: completion can be requested while
        // the transition is still gated on its elements loading (a skip, or the next transition
        // interrupting this one), and it must settle this task either way.
        controller.onComplete(() => {
            resetRefs();
            setTransitionTask(null);
            onTransition?.(newTransition);
            resolve();
            awaitable.resolve();
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
            const ref = React.createRef<DisplayableElementRef<U> | null>();
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

        // The animation is not started here: the transition's groups only mount in the commit
        // that renders this task, so the layout effect that sees them mounted applies the start
        // frame and starts the controller once every element has loaded.
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

    function initRefs(): DisplayableRefGroup<U>[] {
        return [[React.createRef<DisplayableElementRef<U> | null>(), currentKey.current]];
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
        transitionTask,
        initDisplayable,
        applyTransform,
        applyTransition: applyTransition as (transition: Transition, resolve: () => void) => Timeline,
        applyLoop,
        stopLoop,
        updateStyleSync,
        flush,
        deps: [transformToken, transitionTask, refs],
    };
}



