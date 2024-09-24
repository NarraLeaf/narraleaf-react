import {LogicAction} from "@core/action/logicAction";
import Actions = LogicAction.Actions;
import GameElement = LogicAction.GameElement;

export type Proxied<T extends Record<any, any>, U extends Record<any, any>> =
    T & U;

export type ChainedAction = Proxied<GameElement, Chained<LogicAction.Actions>>;
export type ChainedActions = (ChainedAction | ChainedAction[] | Actions | Actions[])[];

const _Chained = Symbol("_Chained");

export class Chained<T> {
    static isChained<T>(value: any): value is Chained<T> {
        return value && value[_Chained];
    }

    static toActions(chainedActions: ChainedActions): Actions[] {
        return chainedActions
            .flat(2)
            .map(v => {
                if (Chained.isChained(v)) {
                    return v.fromChained(v as any);
                }
                return v;
            })
            .flat(2) satisfies Actions[];
    }

    [_Chained]: boolean = true;
    private __actions: T[] = [];

    public push(...actions: T[]) {
        this.__actions.push(...actions);
    }

    public getActions() {
        return this.__actions;
    }
}

/**
 * - T - the action type
 * - U - self constructor
 */
export class Chainable<T, U extends Record<any, any>> {
    public chain(arg0?: T[] | T): Proxied<U, Chained<T>> {
        const chained: Proxied<U, Chained<T>> =
            Chained.isChained(this) ? (this as unknown as Proxied<U, Chained<T>>) : this.proxy<U, Chained<T>>(this as any, new Chained<T>());

        if (!arg0) {
            return chained;
        }

        const actions = Array.isArray(arg0) ? arg0 : [arg0];
        chained.push(...actions);
        return chained;
    }

    public proxy<T extends Record<any, any>, U extends Record<any, any>>(target: T, chained: U): Proxied<T, U> {
        const proxy = new Proxy(target as any, {
            get: function (target, prop) {
                if (prop in (chained as any)) {
                    return chained[prop as keyof typeof chained];
                }
                const value = target[prop as keyof typeof target] as any;
                if (typeof value === "function") {
                    return value.bind(proxy);
                }
                return value;
            },
            set: function (target, prop, value) {
                target[prop] = value;
                return true;
            }
        }) as Proxied<T, U>;
        return proxy;
    }
}


