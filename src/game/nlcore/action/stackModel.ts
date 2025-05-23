import { Stack } from "@lib/util/data";
import { Awaitable } from "@lib/util/data";
import { GameState, LiveGame } from "../common/game";
import { LogicAction } from "./logicAction";
import { CalledActionResult } from "../gameTypes";


export enum StackModelItemType {
    Action = "action",
    Link = "link",
}

export type StackModelRawData = (
    {
        type: StackModelItemType.Action;
        action: string;
    }
    | {
        type: StackModelItemType.Link;
        action: string;
        stack: string;
    }
)[];

export class StackModel {
    private stack: Stack<LogicAction.Actions | Awaitable<CalledActionResult>>;
    private liveGame: LiveGame;
    private waitingAction: LogicAction.Actions | null = null;
    constructor(public gameState: GameState) {
        this.stack = new Stack<LogicAction.Actions | Awaitable<CalledActionResult>>();
        this.liveGame = gameState.game.getLiveGame();
    }

    rollNext(): CalledActionResult | Awaitable<CalledActionResult> | null {
        // If the action stack is empty
        if (this.stack.isEmpty()) {
            this.gameState.logger.weakWarn("LiveGame", "No current action");
            return null;
        }

        // If the action stack is waiting for a result
        const peek = this.stack.peek()!;
        if (
            Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(peek)
            && !peek.isSettled()
        ) {
            return peek;
        }

        const currentAction = this.stack.pop()!;
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(currentAction)) {
            this.waitingAction = null;
            
            const result = currentAction.result;
            if (result && result.node?.action) {
                this.stack.push(result.node.action);
                this.gameState.logger.debug("next action (resolved awaitable)", result.node.action);
                return result;
            }
        } else {
            const executed = this.executeActions(currentAction);
            this.waitingAction = currentAction;

            if (executed) return executed;
        }

        return null;
    }

    executeActions(action: LogicAction.Actions): CalledActionResult | Awaitable<CalledActionResult> | null {
        const executed = this.liveGame.executeAction(this.gameState, action);

        const handleActionResult = (result: CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null) => {
            if (!result) return null;
            
            if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
                this.gameState.logger.debug("next action (executed awaitable)", result);
                this.stack.push(result);
                return result;
            }
            
            if (result.node?.action) {
                this.gameState.logger.debug("next action (executed)", result);
                this.stack.push(result.node.action);
                return result;
            }
            
            return null;
        };

        if (Array.isArray(executed)) {
            // return the last item
            let last = null;
            for (const item of executed) {
                const result = handleActionResult(item);
                if (result) last = result;
            }
            return last;
        } else {
            const result = handleActionResult(executed);
            if (result) return result;
        }

        return null;
    }
}

