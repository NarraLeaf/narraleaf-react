import {TypedAction} from "@core/action/actions";
import {Awaitable, StringKeyOf} from "@lib/util/data";
import {ServiceSkeleton} from "@core/elements/service";
import {GameState} from "@player/gameState";
import {CalledActionResult} from "@core/gameTypes";
import {Script} from "@core/elements/script";

export type ServiceActionContentType = {
    "service:action": [type: string, args: unknown[]]
};

export class ServiceAction extends TypedAction<ServiceActionContentType, StringKeyOf<ServiceActionContentType>, ServiceSkeleton> {
    public executeAction(gameState: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
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
        return super.executeAction(gameState);
    }
}

