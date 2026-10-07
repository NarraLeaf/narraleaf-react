import {Actionable} from "@core/action/actionable";
import {Awaitable, EventToken, SerializableData, SkipController, StringKeyOf} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {ServiceAction, ServiceActionContentType} from "@core/action/serviceAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {ScriptCtx} from "@core/elements/script";
import {SkipGate} from "@core/action/skipGate";
import {GameState} from "@player/gameState";

type ServiceContentType = {
    [K in string]: any[];
};

/**
 * One request from the player to hurry a running service handler.
 */
export interface ServiceSkipRequest {
    /**
     * `true` for the skip mode - the skip key held, {@link LiveGame.skipDialog}, and
     * {@link LiveGame.fastForward} - and `false` for a single press of the skip key.
     *
     * The same distinction a line of dialogue draws: a single press reveals a line up to its next
     * pause, the skip mode walks past the pauses too.
     */
    readonly forced: boolean;
}

/**
 * The player asking a running handler to hurry, and the handler's answer.
 *
 * A request does not end the handler. The handler decides what being skipped means for it:
 * - **finish now** - put whatever it was doing into its final state and return, in
 *   {@link onRequest};
 * - **ignore it** - carry on; the skip mode waits for the handler, and
 *   {@link LiveGame.fastForward} waits up to its `stepTimeout` before reporting `"stalled"`.
 *   This is what a handler that never looks at `ctx.skip` does;
 * - **refuse** - {@link refuse}: the skip mode still waits, and a fast-forward stops at this step
 *   at once and reports `"refused"`.
 *
 * Requests are broadcast: a handler running in a `Control.all` branch or an async branch is asked
 * whenever the player skips anything, the way a sprite's transition running beside a line is.
 *
 * Only an asynchronous handler is ever asked. A synchronous one has already finished by the time
 * the player could ask.
 */
export interface ServiceSkipSignal {
    /** Whether the player has asked this handler to hurry yet. */
    readonly requested: boolean;
    /** Whether the player has asked it in the skip mode yet. */
    readonly forced: boolean;
    /**
     * Whether the game is in {@link LiveGame.fastForward} right now. A handler that checks it on
     * entry can go straight to its final state.
     */
    readonly fastForwarding: boolean;
    /**
     * Listen for the player asking this handler to hurry.
     *
     * Called once for the first request, and once more the first time a request is
     * {@link ServiceSkipRequest.forced | forced} - not for every repeat, which the skip mode sends
     * many times a second. Registering after a request has already arrived calls the listener at
     * once.
     */
    onRequest(listener: (request: ServiceSkipRequest) => void): EventToken;
    /**
     * Refuse to be fast-forwarded past until the returned function is called.
     *
     * Refusals stack: the step can be skipped again once every one has been released. The message
     * is for people - it is logged, and handed back by {@link LiveGame.fastForward} for a host to
     * show - and nothing in the engine reads it to decide anything.
     */
    refuse(message?: string): () => void;
}

export type ServiceHandlerCtx = ScriptCtx & {
    /**
     * Aborted when this run is cancelled: the player stepped back past it, the story jumped away
     * from it, a `Control.any` it ran in was won by another branch, or the game was reset or loaded.
     *
     * A cancellation cannot be refused, and it does not wait for the handler: by the time the
     * signal fires the game has already moved on. Pass the signal to whatever the handler is
     * waiting on (`fetch(url, {signal})`), and check `signal.aborted` after each `await` before
     * touching the game again.
     */
    signal: AbortSignal;
    /** The player asking this handler to hurry. See {@link ServiceSkipSignal}. */
    skip: ServiceSkipSignal;
    /**
     * Run `handler` when this run is cancelled. Registering after the cancellation runs it at once.
     * @deprecated Use {@link ServiceHandlerCtx.signal}, which fires on the same occasions.
     */
    onAbort: (handler: () => void) => void;
};
export type ServiceHandler<Args extends any[]> = (ctx: ServiceHandlerCtx, ...args: Args) => void | Promise<void>;

/**
 * The handler runs of one game that are waiting on the player, heard through one subscription.
 *
 * The skip broadcast is already listened to by every mounted dialog and displayable, so a listener
 * per run would push it past the dispatcher's warning threshold the moment a few rows wait side by
 * side in a `Control.all`. However many runs are waiting, they cost the broadcast one listener, and
 * none once they have all settled.
 * @internal
 */
class ServiceSkipHub {
    private static readonly hubs = new WeakMap<GameState, ServiceSkipHub>();

    public static of(gameState: GameState): ServiceSkipHub {
        let hub = ServiceSkipHub.hubs.get(gameState);
        if (!hub) {
            hub = new ServiceSkipHub(gameState);
            ServiceSkipHub.hubs.set(gameState, hub);
        }
        return hub;
    }

    private readonly runs = new Set<ServiceSkip>();
    private token: EventToken | null = null;

    private constructor(private readonly gameState: GameState) {
    }

    public add(run: ServiceSkip): void {
        this.runs.add(run);
        if (!this.token) {
            this.token = this.gameState.events.on(GameState.EventTypes["event:state.player.skip"], (force?: boolean) => {
                for (const waiting of [...this.runs]) {
                    waiting.receive(force === true);
                }
            });
        }
    }

    public remove(run: ServiceSkip): void {
        this.runs.delete(run);
        if (this.runs.size === 0) {
            this.token?.cancel();
            this.token = null;
        }
    }
}

/**
 * The {@link ServiceSkipSignal} of one handler run.
 *
 * It listens for the player only from the moment its handler has returned a promise until that run
 * settles, so a synchronous handler costs nothing and a finished one is never asked again.
 * @internal
 */
class ServiceSkip implements ServiceSkipSignal {
    private _requested = false;
    private _forced = false;
    private listeners: ((request: ServiceSkipRequest) => void)[] = [];
    private listening = false;
    private disposed = false;

    constructor(
        private readonly gameState: GameState,
        public readonly gate: SkipGate,
        private readonly onListenerError: (error: unknown) => void,
    ) {
    }

    get requested(): boolean {
        return this._requested;
    }

    get forced(): boolean {
        return this._forced;
    }

    get fastForwarding(): boolean {
        return this.gameState.isFastForwarding();
    }

    public onRequest(listener: (request: ServiceSkipRequest) => void): EventToken {
        const cancel = () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
        if (this.disposed) {
            return {cancel};
        }
        this.listeners.push(listener);
        if (this._requested) {
            this.call(listener);
        }
        return {cancel};
    }

    public refuse(message?: string): () => void {
        return this.gate.refuse(message);
    }

    /** Start listening for the player. */
    public listen(): void {
        if (this.disposed || this.listening) {
            return;
        }
        this.listening = true;
        ServiceSkipHub.of(this.gameState).add(this);
    }

    public dispose(): void {
        this.disposed = true;
        if (this.listening) {
            this.listening = false;
            ServiceSkipHub.of(this.gameState).remove(this);
        }
        this.listeners = [];
    }

    public receive(forced: boolean): void {
        if (this.disposed) {
            return;
        }
        // Edge-triggered: the skip mode repeats its request many times a second, and a handler is
        // only told what is new - that it has been asked at all, and that it is now being asked in
        // the skip mode.
        const escalated = !this._requested || (forced && !this._forced);
        if (!escalated) {
            return;
        }
        this._requested = true;
        if (forced) {
            this._forced = true;
        }
        for (const listener of [...this.listeners]) {
            this.call(listener);
        }
    }

    private call(listener: (request: ServiceSkipRequest) => void): void {
        // A listener's error belongs to the handler's run, not to whoever pressed the skip key.
        try {
            listener({forced: this._forced});
        } catch (error) {
            this.onListenerError(error);
        }
    }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return value !== null
        && (typeof value === "object" || typeof value === "function")
        && typeof (value as PromiseLike<unknown>).then === "function";
}

export class ServiceSkeleton<
    Content extends ServiceContentType = ServiceContentType,
    RawData extends Record<string, SerializableData> | null = never,
> extends Actionable<RawData, ServiceSkeleton> {
    /**@internal */
    private _handlers: {
        [K in keyof Content]?: ServiceHandler<Content[K]>;
    } = {};

    /**
     * Register an action handler.
     *
     * A handler that returns a promise holds the story until the promise settles, the way a line
     * of dialogue does; one that returns anything else lets it carry on at once. If the promise
     * rejects, the story stops at this action and the error is reported.
     *
     * While it holds the story, a handler hears about the player through its context:
     * `ctx.skip` when the player asks it to hurry, which it may answer or refuse, and `ctx.signal`
     * when its run is cancelled, which it may not.
     * @param key - The action key to handle.
     * @param handler - Callback invoked when the action fires.
     * @example
     * ```ts
     * this.on("add", (ctx, name) => {
     *   console.log("Adding", name);
     * });
     *
     * this.on("countdown", async (ctx, seconds: number) => {
     *   // Skipping finishes the countdown at once.
     *   const done = new Promise<void>(resolve => {
     *     const timer = setTimeout(resolve, seconds * 1000);
     *     ctx.skip.onRequest(() => {
     *       clearTimeout(timer);
     *       resolve();
     *     });
     *     ctx.signal.addEventListener("abort", () => clearTimeout(timer));
     *   });
     *   await done;
     * });
     *
     * this.on("minigame", async (ctx) => {
     *   // A fast-forward cannot play the minigame for the player, so it stops here.
     *   ctx.skip.refuse("waiting for the minigame");
     *   await playMinigame(ctx.signal);
     * });
     * ```
     */
    public on<K extends StringKeyOf<Content>>(key: K, handler: ServiceHandler<Content[K]>): this {
        this._registerActionHandler(key, handler);
        return this;
    }

    /**
     * Trigger a registered service action to be executed in a scene.
     * @param type - Action key registered with `on`.
     * @param args - Arguments for the action handler.
     * @example
     * ```ts
     * service.trigger("myAction", "foo", 123);
     * ```
     */
    public trigger<K extends StringKeyOf<Content>>(type: K, ...args: Content[K]): Proxied<this, Chained<ServiceAction, this>> {
        const chain = this.chain();
        return chain.chain(this._createAction(chain as any, type, args)) as unknown as Proxied<this, Chained<ServiceAction, this>>;
    }

    /**@internal */
    triggerAction<K extends StringKeyOf<Content>>(ctx: ScriptCtx, type: K, args: Content[K]): void | Awaitable<void> {
        const handler = this._handlers[type];
        if (!handler) {
            ctx.gameState.logger.warn(`(in User-Defined Service) Trying to trigger action ${type} before it's registered, please use "service.on" to register the action`);
            return;
        }

        // Built before the handler runs, because the handler is handed both; whether there is a run
        // to wait on is only known once it returns.
        const awaitable = new Awaitable<void>();
        const abort = new AbortController();
        const gate = new SkipGate();
        const skip: ServiceSkip = new ServiceSkip(ctx.gameState, gate, error => {
            skip.dispose();
            awaitable.fail(error);
        });
        const onAbort = (listener: () => void): void => {
            if (abort.signal.aborted) {
                listener();
                return;
            }
            abort.signal.addEventListener("abort", () => listener(), {once: true});
        };

        let result: unknown;
        try {
            result = handler({...ctx, signal: abort.signal, skip, onAbort}, ...args);
        } catch (error) {
            skip.dispose();
            throw error;
        }

        // Told apart by what the handler returned, not by how it was declared: a function that
        // returns a promise without being `async`, or an `async` function a build has compiled down
        // to a plain one, is waited for all the same.
        if (!isThenable(result)) {
            skip.dispose();
            if (gate.isRefused()) {
                ctx.gameState.logger.weakWarn(
                    "Service",
                    `(in User-Defined Service) The handler of "${type}" refused to be skipped, but it is synchronous: `
                    + "the story never waits for it, so there is nothing to refuse. Return a promise to hold the story."
                );
            }
            return;
        }

        awaitable.registerSkipController(new SkipController(() => {
            abort.abort();
            skip.dispose();
        }));
        SkipGate.attach(awaitable, gate);
        skip.listen();

        result.then(
            () => {
                skip.dispose();
                awaitable.resolve();
            },
            (error: unknown) => {
                skip.dispose();
                // A run that was cancelled has already been settled, so this does nothing for it -
                // which is what keeps the `AbortError` of a `fetch` given `ctx.signal` from being
                // reported as a failure.
                awaitable.fail(error);
            },
        );
        return awaitable;
    }

    /**@internal */
    private _registerActionHandler<K extends StringKeyOf<Content>>(key: K, handler: ServiceHandler<Content[K]>): void {
        this._handlers[key] = handler;
    }

    /**@internal */
    private _createAction<K extends StringKeyOf<Content>>(chain: Proxied<ServiceSkeleton, Chained<ServiceAction>>, type: K, args: Content[K]): ServiceAction {
        return new ServiceAction(
            chain,
            "service:action",
            new ContentNode<ServiceActionContentType["service:action"]>().setContent([type, args])
        );
    }
}

// @ts-expect-error: this class is used as a mask
class ServiceSkeletonMask<
    Content extends ServiceContentType = ServiceContentType,
    RawData extends Record<string, SerializableData> | null = never,
> extends ServiceSkeleton<Content, RawData> {
    private declare triggerAction: never;
    private declare toData: never;
    private declare fromChained: never;
    private declare chain: never;
    private declare proxy: never;
    private declare combineActions: never;
    private declare push: never;
    private declare getActions: never;
    private declare getSelf: never;
    private declare newChain: never;
    private declare id: never;
    private declare setId: never;
    private declare getId: never;
    private declare reset: never;
    private declare fromData: never;
    private declare construct: never;
    private declare __self: never;
    private declare __actions: never;
}

export abstract class Service<
    Content extends ServiceContentType = ServiceContentType,
    RawData extends Record<string, SerializableData> | null = Record<string, any>,
> extends ServiceSkeletonMask<Content, RawData> {
    /**
     * Serialize the service to JSON-serializable data.
     * Return `null` when nothing needs to be saved.
     */
    abstract serialize?(): RawData | null;

    /**
     * Restore data previously produced by `serialize`.
     * @param data - Serialized payload that matches the service storage format.
     */
    abstract deserialize?(data: RawData): void;
}
