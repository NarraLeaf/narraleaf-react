import {
    AnimationController,
    AnimationDataTypeArray,
    AnimationTaskMapArray,
    AnimationTypeToData,
    TransitionAnimationType,
    TransitionTask
} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import type {AnimationPlaybackControls} from "motion/react";
import {animate} from "motion/react";


export abstract class Transition<T extends HTMLElement = HTMLElement, U extends TransitionAnimationType[] = TransitionAnimationType[]> {
    public static AnimationType = TransitionAnimationType;

    /**
     * Create a transition task, this method shouldn't have any side effects
     */
    abstract createTask(): TransitionTask<T, U>;

    abstract copy(): Transition<T, U>;

    /**@internal */
    public requestAnimations(tasks: AnimationTaskMapArray<U>): AnimationController<U> {
        const values: AnimationDataTypeArray<U> = tasks.map(v => v.start) as AnimationDataTypeArray<U>;
        const controllers: AnimationPlaybackControls[] = [] as AnimationPlaybackControls[];

        const onUpdateListeners: ((values: AnimationDataTypeArray<U>) => void)[] = [];
        const onCompleteListeners: (() => void)[] = [];
        const complete = () => {
            controllers.forEach(controller => controller.complete());
        };
        const start = () => {
            tasks.forEach((task, index) => {
                controllers.push(this.requestMotion(task, {
                    onComplete: () => {
                        values[index] = task.end;
                        if (controllers.every(controller => controller.state === "finished")) {
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
            },
            onComplete: (handler: () => void) => {
                onCompleteListeners.push(handler);
            },
            complete,
            start,
        } satisfies AnimationController<U>;
    }

    /**@internal */
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
