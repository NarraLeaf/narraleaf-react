import {Actionable} from "@core/action/actionable";
import {StorableType} from "@core/elements/persistent/type";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/game";
import {PersistentActionContentType, PersistentActionTypes} from "@core/action/actionTypes";
import {PersistentAction} from "@core/action/actions/persistentAction";
import {BooleanKeys, StringKeyOf, Values} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {Lambda} from "@core/elements/condition";
import {Word} from "@core/elements/character/word";
import {DynamicWord, DynamicWordResult} from "@core/elements/character/sentence";
import {LambdaHandler} from "@core/elements/type";
import {Namespace, Storable} from "@core/elements/persistent/storable";

type PersistentContent = {
    [key: string]: StorableType;
};
type ChainedPersistent<T extends PersistentContent> = Proxied<Persistent<T>, Chained<LogicAction.Actions>>;

export class Persistent<T extends PersistentContent>
    extends Actionable<null> {

    constructor(private namespace: string, private defaultContent: T) {
        super();
    }

    /**@internal */
    init(storable: Storable) {
        if (!storable.hasNamespace(this.namespace)) {
            storable.addNamespace(new Namespace<T>(this.namespace, this.defaultContent));
        }
    }

    /**
     * @chainable
     */
    // public set<K extends StringKeyOf<T>>(key: K, value: T[K]): ChainedPersistent<T> {
    //     return this.chain(this.createAction(
    //         PersistentActionTypes.set,
    //         [key, value]
    //     ));
    // }
    public set<K extends StringKeyOf<T>>(key: K, value: T[K]): ChainedPersistent<T>;
    public set<K extends StringKeyOf<T>>(key: K, handler: (value: T[K]) => T[K]): ChainedPersistent<T>;
    public set<K extends StringKeyOf<T>>(key: K, $arg1: T[K] | ((value: T[K]) => T[K])): ChainedPersistent<T> {
        return this.chain(this.createAction(
            PersistentActionTypes.set,
            [key, $arg1]
        ));
    }

    /**
     * Determine whether the values are equal, can be used in {@link Condition}
     */
    public equals<K extends StringKeyOf<T>>(key: K, value: T[K]): Lambda<boolean> {
        return new Lambda(({storable}) => {
            return storable.getNamespace<T>(this.namespace).equals<K>(key, value);
        });
    }

    /**
     * Determine whether the values aren't equal, can be used in {@link Condition}
     */
    public notEquals<K extends StringKeyOf<T>>(key: K, value: T[K]): Lambda<boolean> {
        return new Lambda(({storable}) => {
            return !storable.getNamespace<T>(this.namespace).equals<K>(key, value);
        });
    }

    /**
     * Determine whether the value is true, can be used in {@link Condition}
     */
    public isTrue<K extends Extract<keyof T, BooleanKeys<T>>>(key: K): Lambda<boolean> {
        return new Lambda(({storable}) => {
            return storable.getNamespace(this.namespace).equals(key, true);
        });
    }

    /**
     * Determine whether the value is false, can be used in {@link Condition}
     */
    public isFalse<K extends Extract<keyof T, BooleanKeys<T>>>(key: K): Lambda<boolean> {
        return new Lambda(({storable}) => {
            return storable.getNamespace(this.namespace).equals(key, false);
        });
    }

    /**
     * Determine whether the value isn't null or undefined, can be used in {@link Condition}
     */
    public isNotNull<K extends StringKeyOf<T>>(key: K): Lambda<boolean> {
        return new Lambda(({storable}) => {
            const value = storable.getNamespace(this.namespace).get(key);
            return value !== null && value !== undefined;
        });
    }

    /**
     * Convert to a dynamic word
     * @example
     * ```typescript
     * character.say(["You have ", persis.toWord("gold"), " gold"]);
     * ```
     */
    public toWord<K extends StringKeyOf<T>>(key: K): Word<DynamicWord> {
        return new Word<DynamicWord>(({storable}) => {
            return [String(storable.getNamespace<T>(this.namespace).get<K>(key))];
        });
    }

    /**
     * Alias of {@link toWord}
     */
    public get<K extends StringKeyOf<T>>(key: K): Word<DynamicWord> {
        return this.toWord(key);
    }

    /**
     * Create a conditional word
     *
     * @example
     * ```typescript
     * character.say([
     *   "Your flag is ",
     *   persis.conditional(
     *     persis.isTrue("flag"),
     *     "on",
     *     "off"
     *   )
     * ]);
     * ```
     */
    public conditional(
        condition: Lambda<boolean> | LambdaHandler<boolean>,
        ifTrue: DynamicWordResult,
        ifFalse: DynamicWordResult
    ): Word {
        return new Word((ctx) => {
            const isTrue = Lambda.from(condition).evaluate(ctx).value;
            return isTrue ? ifTrue : ifFalse;
        });
    }

    /**
     * Evaluate the JavaScript function and determine whether the result is true
     */
    public evaluate<K extends StringKeyOf<T>>(key: K, fn: (value: T[K]) => boolean): Lambda<boolean> {
        return new Lambda(({storable}) => {
            return fn(storable.getNamespace<T>(this.namespace).get<K>(key));
        });
    }

    /**@internal */
    getNamespaceName(): string {
        return this.namespace;
    }

    /**@internal */
    private createAction<U extends Values<typeof PersistentActionTypes>>(
        type: U,
        content: PersistentActionContentType[U]
    ): PersistentAction<U> {
        return new PersistentAction<U>(
            this.chain(),
            type,
            ContentNode.create(content)
        );
    }
}
