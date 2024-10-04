import {LogicAction} from "@core/action/logicAction";
import {BaseElement} from "@core/action/baseElement";
import {ControlAction} from "@core/action/actions";
import {ContentNode} from "@core/action/tree/actionTree";
import type {Control} from "@core/elements/control";
import Actions = LogicAction.Actions;
import GameElement = LogicAction.GameElement;

export type Proxied<T extends Record<any, any>, U extends Record<any, any>> =
    T & U;

export type ChainedAction = Proxied<GameElement, Chained<LogicAction.Actions>>;
export type ChainedActions = (ChainedAction | ChainedAction[] | Actions | Actions[])[];

const ChainedFlag = Symbol("_Chained");

export class Chained<T, Self extends Chainable<any, any> = any> {
    static isChained<T>(value: any): value is Chained<T> {
        return value && value[ChainedFlag];
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
            .flat(3) satisfies Actions[];
    }

    /**@internal */
    [ChainedFlag]: boolean = true;
    /**@internal */
    private __actions: T[] = [];
    /**@internal */
    private readonly __self: any;

    /**@internal */
    constructor(self: Self) {
        this.__self = self;
    }

    /**@internal */
    public push(...actions: T[]) {
        this.__actions.push(...actions);
    }

    /**@internal */
    public getActions() {
        return this.__actions;
    }

    /**@internal */
    public getSelf(): Self {
        return this.__self;
    }

    /**@internal */
    public newChain() {
        return this.getSelf().chain();
    }
}

/**
 * - T - the action type
 * - U - self constructor
 */
export class Chainable<T, U extends Chainable<any, any>> extends BaseElement {
    /**@internal */
    public chain(arg0?: T[] | T): Proxied<U, Chained<T, U>> {
        const chained: Proxied<U, Chained<T, U>> =
            Chained.isChained(this) ?
                (this as unknown as Proxied<U, Chained<T>>) :
                this.proxy<U, Chained<T, U>>(this as any, new Chained<T, U>(this as any));

        if (!arg0) {
            return chained;
        }

        const actions = Array.isArray(arg0) ? arg0 : [arg0];
        chained.push(...actions);
        return chained;
    }

    /**@internal */
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

    /**@internal */
    protected combineActions(
        control: Control,
        getActions: ((chain: Proxied<U, Chained<T, U>>)
            => ChainedAction)
    ): Proxied<U, Chained<T, U>> {
        const chain = getActions(this.chain().newChain());
        const action = new ControlAction(
            control.chain(),
            ControlAction.ActionTypes.do,
            new ContentNode().setContent([
                this.construct(Chained.toActions([chain]))
            ])
        );
        return this.chain(action as T);
    }
}


