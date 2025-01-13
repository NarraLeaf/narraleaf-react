import {
    AnimationController,
    AnimationDataTypeArray,
    AnimationTaskMapArray,
    AnimationTypeToData,
    ElementProp,
    TransitionAnimationType,
    TransitionResolver,
    TransitionTask
} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import type {AnimationPlaybackControls} from "motion/react";
import {animate} from "motion/react";


export abstract class Transition<T extends HTMLElement = HTMLElement, U extends TransitionAnimationType[] = any> {
    public static AnimationType = TransitionAnimationType;

    /**
     * Create a transition task, this method shouldn't have any side effects
     */
    abstract createTask(): TransitionTask<T, U>;

    abstract copy(): any;

    /**@package */
    public requestAnimations(tasks: AnimationTaskMapArray<U>): AnimationController<U> {
        const values: AnimationDataTypeArray<U> = tasks.map(v => v.start) as AnimationDataTypeArray<U>;
        const controllers: AnimationPlaybackControls[] = [] as AnimationPlaybackControls[];

        // for some reason, controller.state isn't working,
        // so we have to keep track of the completed tasks
        let completed: number = 0;

        const onUpdateListeners: ((values: AnimationDataTypeArray<U>) => void)[] = [];
        const onCompleteListeners: (() => void)[] = [];
        const complete = () => {
            if (completed === tasks.length) {
                return;
            }
            controllers.forEach(controller => controller.complete());
        };
        const start = () => {
            if (controllers.length > 0) {
                throw new Error("Animation controllers are already started");
            }
            tasks.forEach((task, index) => {
                controllers.push(this.requestMotion(task, {
                    onComplete: () => {
                        values[index] = task.end;
                        completed++;

                        if (completed === tasks.length) {
                            onCompleteListeners.forEach(v => v());
                        }
                    },
                    onUpdate: (value) => {
                        values[index] = value;
                        onUpdateListeners.forEach(v => v(values));
                    },
                }));
            });
        };

        return {
            onUpdate: (handler: (values: AnimationDataTypeArray<U>) => void) => {
                onUpdateListeners.push(handler);
                return {
                    cancel: () => {
                        const index = onUpdateListeners.indexOf(handler);
                        if (index !== -1) {
                            onUpdateListeners.splice(index, 1);
                        }
                    }
                };
            },
            onComplete: (handler: () => void) => {
                onCompleteListeners.push(handler);
                return {
                    cancel: () => {
                        const index = onCompleteListeners.indexOf(handler);
                        if (index !== -1) {
                            onCompleteListeners.splice(index, 1);
                        }
                    }
                };
            },
            complete,
            start,
        } satisfies AnimationController<U>;
    }

    /**@package */
    public toFinalStyle(task: TransitionTask<T, U>): ElementProp<T>[] {
        return task.resolve.map(resolver => {
            if (typeof resolver === "function") {
                return resolver(...task.animations.map(v => v.end) as AnimationDataTypeArray<U>);
            }
            return resolver.resolver(...task.animations.map(v => v.end) as AnimationDataTypeArray<U>);
        });
    }

    /**
     * Mark the resolver as the current state
     *
     * any resolver that is marked as current will be applied to the current state
     * and be disposed of when the transition is completed
     */
    public asPrev<U extends TransitionAnimationType[] = any>(resolver: (...args: AnimationDataTypeArray<U>) => ElementProp<T>): TransitionResolver<T, U> {
        return {
            resolver,
            key: "current",
        } satisfies TransitionResolver<T, U>;
    }

    /**
     * Mark the resolver as the target state
     *
     * any resolver that is marked as a target will be kept as the target state after the transition
     */
    public asTarget<U extends TransitionAnimationType[] = any>(resolver: (...args: AnimationDataTypeArray<U>) => ElementProp<T>): TransitionResolver<T, U> {
        return {
            resolver,
            key: "target",
        } satisfies TransitionResolver<T, U>;
    }

    /**@package */
    private requestMotion<T extends TransitionAnimationType = TransitionAnimationType>(option: {
        start: AnimationTypeToData<T>;
        end: AnimationTypeToData<T>;
        duration: number;
        ease?: TransformDefinitions.EasingDefinition;
    }, events: {
        onComplete?: () => void;
        onUpdate?: (value: AnimationTypeToData<T>) => void;
    }): AnimationPlaybackControls {
        return animate(option.start, option.end, {
            duration: option.duration / 1000,
            onUpdate: (value) => {
                if (events.onUpdate) {
                    events.onUpdate(value);
                }
            },
            onComplete: () => {
                if (events.onComplete) {
                    events.onComplete();
                }
            },
            ease: option.ease,
        });
    }
}
