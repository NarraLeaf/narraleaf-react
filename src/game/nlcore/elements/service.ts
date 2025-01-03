import {Actionable} from "@core/action/actionable";
import {Awaitable, isAsyncFunction, SerializableData, SkipController, StringKeyOf} from "@lib/util/data";
import {Chained, Proxied} from "@core/action/chain";
import {ServiceAction, ServiceActionContentType} from "@core/action/serviceAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {ScriptCtx} from "@core/elements/script";

type ServiceContentType = {
    [K in string]: any[];
};
export type ServiceHandlerCtx = ScriptCtx & {
    onAbort: (handler: () => void) => void;
};
export type ServiceHandler<Args extends any[]> = (ctx: ServiceHandlerCtx, ...args: Args) => void | Promise<void>;

export class ServiceSkeleton<
    Content extends ServiceContentType = ServiceContentType,
    RawData extends Record<string, SerializableData> | null = never,
> extends Actionable<RawData, ServiceSkeleton> {
    /**@internal */
    private _handlers: {
        [K in keyof Content]?: ServiceHandler<Content[K]>;
    } = {};

    /**
     * Register an action handler
     * @param key action type
     * @param handler handler, the arguments are the same as the action content type
     */
    public onAction<K extends StringKeyOf<Content>>(key: K, handler: ServiceHandler<Content[K]>): this {
        this._registerActionHandler(key, handler);
        return this;
    }

    public action<K extends StringKeyOf<Content>>(type: K, ...args: Content[K]): Proxied<this, Chained<ServiceAction, this>> {
        const chain = this.chain();
        return chain.chain(this._createAction(chain as any, type, args)) as unknown as Proxied<this, Chained<ServiceAction, this>>;
    }

    /**@internal */
    triggerAction<K extends StringKeyOf<Content>>(ctx: ScriptCtx, type: K, args: Content[K]): void | Awaitable<void> {
        const handler = this._handlers[type];
        if (!handler) return;

        if (isAsyncFunction<[ctx: ServiceHandlerCtx, ...args: Content[K]], void>(handler)) {
            const skipHandlers: (() => void)[] = [];
            const awaitable = new Awaitable<void>()
                .registerSkipController(new SkipController(() => {
                    for (const handler of skipHandlers) {
                        handler?.();
                    }
                }));
            const onAbort = (handler: () => void): void => {
                skipHandlers.push(handler);
            };
            handler({...ctx, onAbort}, ...args)
                .then(() => awaitable.resolve());
            return awaitable;
        }
        handler({
            ...ctx,
            onAbort: () => {
            }
        }, ...args);
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

type AbortifyFn<T extends any[]> = ServiceHandler<T> & {
    onAbort: (handler: () => void) => AbortifyFn<T>;
};

export abstract class Service<
    Content extends ServiceContentType = ServiceContentType,
    RawData extends Record<string, SerializableData> | null = Record<string, any>,
> extends ServiceSkeletonMask<Content, RawData> {
    public static abortify<T extends any[]>(fn: ServiceHandler<T>): AbortifyFn<T> {
        const abortHandlers: (() => void)[] = [];
        const abortableFn = function (ctx: ServiceHandlerCtx, ...args: T): void | Promise<void> {
            ctx.onAbort(() => {
                for (const handler of abortHandlers) {
                    handler();
                }
            });
            return fn(ctx, ...args);
        };
        abortableFn.onAbort = (handler: () => void): AbortifyFn<T> => {
            abortHandlers.push(handler);
            return abortableFn;
        };
        return abortableFn;
    }

    /**
     * Serialize the service to data
     *
     * **Note**: data must be JSON serializable, return null if nothing needs to be saved
     */
    abstract serialize?(): RawData | null;

    /**
     * Load data to the service
     * @param data data exported from toData
     */
    abstract deserialize?(data: RawData): void;
}
