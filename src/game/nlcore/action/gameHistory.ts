import { Action } from "./action";
import { ActionHistory, ActionHistoryManager } from "./actionHistory";

type GameHistoryAction = {
    token: string;
    action: Action;
};

type GameElementHistory =
    | {
        type: "say";
        text: string;
        voice: string | null;
    }
    | {
        type: "menu";
        text: string | null;
        selected: string;
    };

export type GameHistory = GameHistoryAction & {
    element: GameElementHistory;
};

export class GameHistoryManager {
    private history: GameHistory[] = [];
    private actionHistoryMgr: ActionHistoryManager;

    constructor(actionHistoryMgr: ActionHistoryManager) {
        this.actionHistoryMgr = actionHistoryMgr;

        this.actionHistoryMgr.onUndo((affected) => {
            this.crossFilter(affected);
        });

        this.actionHistoryMgr.onHistoryLimit((removed) => {
            this.crossFilter(removed);
        });
    }

    push(action: GameHistory): this {
        this.history.push(action);
        return this;
    }

    getHistory(): GameHistory[] {
        return this.history;
    }

    reset() {
        this.history = [];
    }
    
    private crossFilter(affected: ActionHistory[]) {
        const affectedSet = new Set(affected.map(a => a.id));
        this.history = this.history.filter(h => !affectedSet.has(h.token));
    }
}
