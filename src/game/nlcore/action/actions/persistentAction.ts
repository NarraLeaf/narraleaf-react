import {PersistentActionContentType, PersistentActionTypes} from "@core/action/actionTypes";
import {GameState} from "@player/gameState";
import {TypedAction} from "@core/action/actions";
import {Values} from "@lib/util/data";
import {Persistent, PersistentContent} from "@core/elements/persistent";
import { Namespace } from "../../common/game";
import { ContentNode } from "../tree/actionTree";
import { ActionExecutionInjection } from "../action";

export class PersistentAction<T extends Values<typeof PersistentActionTypes> = Values<typeof PersistentActionTypes>>
    extends TypedAction<PersistentActionContentType, T, Persistent<any>> {
    static ActionTypes = PersistentActionTypes;

    executeAction(gameState: GameState, injection: ActionExecutionInjection) {
        const action: PersistentAction = this;
        if (action.is<PersistentAction<"persistent:set">>(PersistentAction, "persistent:set")) {
            const [key, value] = (action.contentNode as ContentNode<PersistentActionContentType["persistent:set"]>).getContent();
            const namespace = gameState.getStorable().getNamespace(
                action.callee.getNamespaceName()
            );
            const prevValue = namespace.get(key);

            if (typeof value === "function") {
                const prevValue = namespace.get(key);
                namespace.set(key, value(prevValue));
            } else {
                namespace.set(key, value);
            }
            
            gameState.actionHistory.push<[Partial<PersistentContent>]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevValue) => {
                namespace.set(key, prevValue);
            }, [prevValue]);

            return super.executeAction(gameState, injection);
        } else if (action.is<PersistentAction<"persistent:assign">>(PersistentAction, "persistent:assign")) {
            const [value] = (action.contentNode as ContentNode<PersistentActionContentType["persistent:assign"]>).getContent() as [Partial<PersistentContent>];
            const namespace = gameState.getStorable().getNamespace(
                action.callee.getNamespaceName()
            ) as Namespace<PersistentContent>;
            const prevValue: Partial<PersistentContent> = {};

            Object.keys(value).forEach((key: string) => {
                prevValue[key] = namespace.get(key);
                namespace.set(key, value[key]);
            });

            gameState.actionHistory.push<[Partial<PersistentContent>]>({
                action: this,
                stackModel: injection.stackModel
            }, (prevValue) => {
                Object.keys(prevValue).forEach(key => {
                    namespace.set(key, prevValue[key]);
                });
            }, [prevValue]);
            
            return super.executeAction(gameState, injection);
        }
        throw this.unknownTypeError();
    }
}