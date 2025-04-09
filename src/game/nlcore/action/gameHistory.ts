import { Action } from "./action";
import { ActionHistory, ActionHistoryManager } from "./actionHistory";

type GameHistoryAction = {
    token: string;
    action: Action;
}

type GameElementHistory =
    | {
        type: "say";
        text: string;
        voice: string;
    }
    | {
        type: "menu";
        text: string;
        options: string[];
        selected: string;
        selectedIndex: number;
    }

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
    }

    push(action: GameHistory): this {
        this.history.push(action);
        return this;
    }

    getHistory(): GameHistory[] {
        return this.history;
    }
    
    private crossFilter(affected: ActionHistory[]) {
        const affectedSet = new Set(affected.map(a => a.id));

        this.history = this.history.filter(h => affectedSet.has(h.token));
    }
}
