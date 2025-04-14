import {Awaitable, createMicroTask, EventToken, SkipController} from "@lib/util/data";
import {GameStateGuard, GuardWarningType} from "@player/guard";
import {RuntimeGameError} from "@core/common/Utils";

type TimelineStatus = "pending" | "cancelled" | "resolved";

export class Timeline {
    public static proxy<T>(onSettled: (resolved: Timeline[], canceled: Timeline[]) => void): [awaitable: Awaitable<T>, timeline: Timeline] {
        const awaitable = new Awaitable<T>();
        const proxyAwaitable = new Awaitable<void>();
        const timeline = new Timeline(proxyAwaitable);

        timeline
            .onTimelineRegistered(() => {
                proxyAwaitable.resolve();
            })
            .onSettled(() => {
                const [resolved, cancelled] = timeline.catSettled();
                onSettled(resolved, cancelled);
            });
        awaitable.onSkipControllerRegister((controller) => {
            controller.onAbort(() => {
                timeline.abort();
            });
        });

        return [awaitable, timeline];
    }

    /**
     * Creates a new awaitable that resolves when any of the given awaitables resolves.
     * All input awaitables are attached to a timeline for global tracking and cancellation.
     *
     * Behavior:
     * - The returned `awaitable` resolves with the value of the first resolved awaitable.
     * - Cancellations of individual awaitables are ignored.
     * - If the outer awaitable is aborted, the entire timeline and all child awaitables are aborted.
     * - The `timeline` is returned for centralized management, but does not affect resolution logic.
     *
     * This is conceptually similar to `Promise.any`, but built for the Awaitable + Timeline system.
     *
     * @template T The resolved type of the input awaitables.
     * @param {Awaitable<T>[]} awaitables An array of awaitables to monitor.
     * @returns {[Awaitable<T>, Timeline]} A tuple containing:
     * - an awaitable that resolves with the first resolved value
     * - a timeline that includes all provided awaitables as children
     */
    public static any<T>(awaitables: Awaitable[]): [Awaitable<T>, Timeline] {
        if (awaitables.length === 0) {
            throw new RuntimeGameError("Cannot create an 'any' timeline with no awaitables.");
        }

        const awaitable = new Awaitable();
        const awaitableProxy: Awaitable<void> = new Awaitable<void>();
        const timeline = new Timeline(awaitableProxy);

        let settled = false;

        for (const child of awaitables) {
            timeline.attachChild(child);

            child.then((value) => {
                if (!settled) {
                    settled = true;
                    awaitable.resolve(value);
                }
            });
        }

        awaitable.onSkipControllerRegister(controller => {
            controller.onAbort(() => {
                timeline.abort();
            });
        });

        return [awaitable, timeline];
    }

    /**
     * Executes a chain of asynchronous steps in sequence using the provided generator function.
     *
     * Each step receives the result of the previous step and returns an `Awaitable<T>`.
     * The process continues until the generator returns `null`, at which point the last value is returned as the final result.
     *
     * This method ensures that:
     * - Only one awaitable runs at a time (strict sequencing).
     * - Cancellation propagates both ways:
     *   - If the outer awaitable is aborted, the currently running inner awaitable is also aborted.
     *   - If the inner awaitable triggers an abort, the sequence is cancelled and no further steps are executed.
     *
     * Designed for use cases such as chained animations, step-based workflows, task pipelining, or recursive async structures.
     *
     * @template T The type of the value passed and returned between steps.
     *
     * @param {function(prev: T): Awaitable<T> | null} generator
     *        A function that receives the result of the previous step and returns:
     *        - a new Awaitable<T> to continue the sequence
     *        - or `null` to terminate the sequence and return the last value.
     *
     * @param {T} initial
     *        The initial value passed to the generator for the first step.
     *
     * @returns {Awaitable<T>} A single awaitable that resolves with the last non-null result
     *                         in the sequence, or aborts if interrupted.
     */
    public static sequence<T>(
        generator: (prev: T) => Awaitable<T> | null,
        initial: T,
    ): Awaitable<T> {
        let currentValue = initial;
        let currentAwaitable: Awaitable<T> | null = null;

        const awaitable = new Awaitable<T>();
        const iterate = () => {
            if (currentAwaitable) {
                let token: EventToken | undefined;
                currentAwaitable.onSkipControllerRegister((controller) => {
                    token = controller.onAbort(() => {
                        awaitable.abort();
                    });
                });
                currentAwaitable.then((value: T) => {
                    token?.cancel();
                    currentValue = value;
                    currentAwaitable = generator(value);

                    if (currentAwaitable) {
                        createMicroTask(() => iterate());
                    } else {
                        awaitable.resolve(currentValue);
                    }
                });
            } else {
                awaitable.resolve(currentValue);
            }
        };
        awaitable.registerSkipController(new SkipController(() => {
            if (currentAwaitable) {
                currentAwaitable.abort();
            }
            return initial;
        }));

        currentAwaitable = generator(initial);
        if (!currentAwaitable) {
            awaitable.resolve(currentValue);
        } else {
            createMicroTask(() => iterate());
        }

        return awaitable;
    }

    private children: Timeline[] = [];
    private _onResolved: (() => void)[] = [];
    private _onCancelled: (() => void)[] = [];
    private _onTimelineRegistered: (() => void)[] = [];
    private _ableToAttach: boolean = true;

    private _status: TimelineStatus = "pending";

    public get status() {
        return this._status;
    }

    constructor(public awaitable: Awaitable, public guard?: GameStateGuard) {
        awaitable.onSettled(() => {
            this.resolveStatus();
        });

        createMicroTask(() => {
            this.preventAttach();
        });
    }

    public isSettled() {
        return this._status !== "pending";
    }

    public isResolved() {
        return this._status === "resolved";
    }

    public isCancelled() {
        return this._status === "cancelled";
    }

    public onResolved(callback: () => void) {
        this._onResolved.push(callback);
    }

    public onCancelled(callback: () => void) {
        this._onCancelled.push(callback);
    }

    public onSettled(callback: () => void) {
        if (this.isSettled()) {
            // for consistent behavior, we should create a microtask for the callback
            // so the callback won't be executed immediately
            createMicroTask(callback);
        } else {
            this.onResolved(callback);
            this.onCancelled(callback);
        }
    }

    public abort() {
        if (this.isSettled()) {
            return;
        }
        this.awaitable.abort();
        this.setStatus("cancelled", this.emitEvents.bind(this));

        this.children.forEach(v => v.abort());
    }

    public attachChild(arg0: Awaitable | Timeline): this {
        if (!this._ableToAttach) {
            throw new RuntimeGameError(
                "Attaching to this timeline violates the timeline's state. \n" +
                "Timeline attaching is only allowed synchronously after the timeline is created. \n" +
                "Current _ableToAttach: " + this._ableToAttach
            );
        }
        const timeline = Awaitable.isAwaitable(arg0) ? new Timeline(arg0, this.guard) : arg0;
        this.children.push(timeline);

        if (this.guard) {
            timeline.setGuard(this.guard);
        }

        timeline.onSettled(() => {
            this.resolveStatus();
        });

        return this;
    }

    public setGuard(guard: GameStateGuard) {
        this.guard = guard;
        return this;
    }

    protected catSettled(): [resolved: Timeline[], cancelled: Timeline[]] {
        return this.children.reduce(([resolved, cancelled], timeline) => {
            if (timeline.isResolved()) {
                resolved.push(timeline);
            } else if (timeline.isCancelled()) {
                cancelled.push(timeline);
            }
            return [resolved, cancelled];
        }, [[], []] as [Timeline[], Timeline[]]);
    }

    protected onTimelineRegistered(callback: () => void): this {
        this._onTimelineRegistered.push(callback);
        return this;
    }

    private resolveStatus() {
        if (this.awaitable.solved && this.children.every(v => v.isSettled())) {
            this.setStatus("resolved", this.emitEvents.bind(this));
        } else if (this.awaitable.skipController?.isAborted()) {
            this.setStatus("cancelled", this.emitEvents.bind(this));
        }
    }

    private emitEvents() {
        if (this.isResolved()) {
            this._onResolved.forEach(v => v());
        } else if (this.isCancelled()) {
            this._onCancelled.forEach(v => v());
        }
        this._onResolved = [];
        this._onCancelled = [];
    }

    /**
     * Set the status of the timeline
     *
     * if the status is already resolved or canceled, it'll silently ignore the status change
     */
    private setStatus(status: TimelineStatus, onChange?: VoidFunction) {
        if (this.isSettled()) {
            if (this.guard) {
                this.guard.warn(
                    GuardWarningType.unexpectedTimelineStatusChange,
                    `Trying to resolve a settled timeline: ${this._status} -> ${status}`
                );
            }
            return;
        }
        if (status !== this._status && onChange) {
            this._status = status;
            onChange();
        } else {
            this._status = status;
        }
    }

    private preventAttach() {
        this._ableToAttach = false;
        this._onTimelineRegistered.forEach(v => v());
    }
}

export class Timelines {
    private timelines: Timeline[] = [];

    constructor(private guard?: GameStateGuard) {
    }

    /**
     * Attaches a new timeline or an awaitable to the task pool.
     * If an Awaitable is provided, it wraps it into a new Timeline.
     * Automatically removes any settled timelines before pushing the new one.
     *
     * @param input - An Awaitable instance or an existing Timeline.
     * @returns The attached Timeline instance.
     */
    public attachTimeline(input: Awaitable | Timeline): Timeline {
        this.cleanupSettled();

        const timeline = input instanceof Timeline ? input : new Timeline(input);
        this.timelines.push(timeline);

        if (this.guard) {
            timeline.setGuard(this.guard);
        }

        return timeline;
    }

    /**
     * Aborts all active timelines and removes any that are already settled.
     */
    public abortAll(): void {
        for (const timeline of this.timelines) {
            timeline.abort();
        }

        this.cleanupSettled();
    }

    /**
     * Removes timelines that have already been resolved or cancelled.
     */
    private cleanupSettled(): void {
        this.timelines = this.timelines.filter(tl => !tl.isSettled());
    }
}

