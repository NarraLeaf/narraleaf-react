import { TypedAction } from "@core/action/actions";
import { Script } from "@core/elements/script";
import { ServiceSkeleton } from "@core/elements/service";
import { Awaitable, StringKeyOf } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { ActionExecutionInjection } from "./action";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

export type ServiceActionContentType = {
    "service:action": [type: string, args: unknown[]]
};

export class ServiceAction extends TypedAction<ServiceActionContentType, StringKeyOf<ServiceActionContentType>, ServiceSkeleton> {
    public executeAction(gameState: GameState, injection: ActionExecutionInjection) {
        const [type, args] = (this.contentNode as any).getContent();
        const res = this.callee.triggerAction(Script.getCtx({
            gameState,
        }), type, args);
        if (Awaitable.isAwaitable(res)) {
            return Awaitable.forward(res, {
                type: this.type as any,
                node: this.contentNode?.getChild()
            });
        }
        return super.executeAction(gameState, injection);
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("ServiceAction");
    }
}

