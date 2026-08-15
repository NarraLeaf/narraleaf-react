import { randId } from "@lib/util/data";
import type { SerializedGameHistory, SerializedGameState } from "../gameTypes";
import { Action } from "./action";
import { ActionHistory, ActionHistoryManager } from "./actionHistory";

type GameHistoryAction = {
    token: string;
    action: Action;
    isPending?: boolean;
};

export type GameElementHistory =
    | {
        type: "say";
        text: string;
        /** Resolved clip URL of the line's voice, if any. */
        voice: string | null;
        /**
         * The line's `Sentence.config.voiceId` - the key its take is filed under, not a URL.
         *
         * A backlog UI that wants a replay button needs an id it can hand back to the host, because
         * the host addresses audio by id (asset, voice unit) and a resolved URL is not one of those.
         * Absent on entries recorded before this field existed, and on a line voiced through the
         * inline `config.voice` rather than the scene's voice map.
         */
        voiceId?: string | number | null;
        character: string | null;
    }
    | {
        type: "menu";
        text: string | null;
        selected: string | null;
    };

export type GameHistory = GameHistoryAction & {
    element: GameElementHistory;
    /**
     * Self-contained core state captured when this line was reached, used to restore the game
     * back to this backlog line (see {@link LiveGame.restoreToHistory}). Optional because a
     * capture can fail, and legacy in-memory entries created before a snapshot was taken.
     */
    snapshot?: SerializedGameState | null;
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

    getByToken(token: string): GameHistory | null {
        return this.history.find(h => h.token === token) ?? null;
    }

    /**
     * Serialize the whole backlog for persistence (save format v2).
     */
    serialize(): SerializedGameHistory[] {
        return this.history.map(h => GameHistoryManager.toSerialized(h));
    }

    /**
     * Serialize the backlog up to and including the entry with the given token.
     *
     * Used by restore-to-history to trim the backlog back to the restored line.
     * Returns an empty array if the token is not found.
     */
    serializeUntil(token: string): SerializedGameHistory[] {
        const index = this.history.findIndex(h => h.token === token);
        if (index < 0) {
            return [];
        }
        return this.history.slice(0, index + 1).map(h => GameHistoryManager.toSerialized(h));
    }

    /**
     * Rebuild the backlog from persisted entries.
     *
     * Each entry is re-bound to a live {@link Action} through `actionMap`; entries whose action no
     * longer exists (the script changed since the save) are dropped rather than throwing, so a
     * still-loadable save degrades to a shorter backlog instead of failing.
     */
    load(entries: SerializedGameHistory[], actionMap: ReadonlyMap<string, Action>): void {
        this.history = [];
        for (const entry of entries) {
            const action = entry.actionId != null ? actionMap.get(entry.actionId) : undefined;
            if (!action) {
                continue;
            }
            this.history.push({
                // The token a caller may still be holding, not a new one: loading a save or
                // restoring a line rebuilds this list, and a fresh token there would quietly
                // invalidate every reference a backlog UI had. Saves written before tokens were
                // persisted carry none, and those entries do get a new one.
                token: entry.token ?? randId(6),
                action,
                element: entry.element,
                isPending: entry.isPending,
                snapshot: entry.snapshot,
            });
        }
    }

    reset() {
        this.history = [];
    }

    private static toSerialized(h: GameHistory): SerializedGameHistory {
        return {
            token: h.token,
            actionId: h.action.getId(),
            element: h.element,
            isPending: h.isPending,
            snapshot: h.snapshot ?? null,
        };
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
