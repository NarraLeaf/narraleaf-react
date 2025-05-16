import { Action } from "./action";
import { ActionHistory, ActionHistoryManager } from "./actionHistory";

type GameHistoryAction = {
    token: string;
    action: Action;
    isPending?: boolean;
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
        selected: string | null;
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

    updateByToken(id: string, handler: (result: GameHistory | null) => void) {
        const result = this.history.find(h => h.token === id);
        handler(result || null);
    }

    resolvePending(id: string) {
        const result = this.history.find((h: GameHistory) => h.token === id);
        if (result) {
            result.isPending = false;
        }
    }
    
    private crossFilter(affected: ActionHistory[]) {
        const affectedSet = new Set(affected.map(a => a.id));
        this.history = this.history.filter(h => !affectedSet.has(h.token));
    }
}
